import {
  Cartridge,
  isTerminal,
  symbolOf,
  watchedProduct,
  type Mode,
  type PlayState,
} from "@baseland/play-schema";
import type { PriceFeed, Tick } from "../market/feed.js";
import type { MarketData } from "../market/public.js";
import type { OrderRequest, OrderStatus, TradingGateway } from "../trading/gateway.js";
import type { EvidenceProvider } from "../brain/evidence.js";
import type { Brain, EvidenceHandle } from "./brain.js";
import { checkOrder, type OrderIntent } from "./leash.js";
import { ledgerOf, unrealizedPnlUsd, type FillPayload } from "./ledger.js";
import { assertTransition } from "./machine.js";
import {
  fillsOf,
  type Pending,
  type PlayPatch,
  type PlayRecord,
  type PlayStatus,
  type PlayStore,
  type TapeEvent,
} from "./store.js";
import { evaluateExit, evaluateTrigger, exitPrices, type ExitReason } from "./triggers.js";

// The Play runtime: owns every running Play's lifecycle. Single engine
// instance; all writes to a Play go through here, serialized per Play.
//
// Flow: armed → (window opens) watching → (trigger) deciding → Brain →
// Leash → awaiting (if asking) → executing (preview → order → fill) →
// watching exits (Ghost) or done. Kill / pause / expiry can cut in where the
// state machine allows (see machine.ts).

export interface RuntimeLimits {
  /** Master switch for real money. Off unless the operator turns it on. */
  liveTradingEnabled: boolean;
  /** Ceiling on any single live order, whatever a cartridge says. */
  hardMaxOrderUsd: number;
}

export interface Logger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface RuntimeDeps {
  store: PlayStore;
  feed: PriceFeed;
  market: MarketData;
  brain: Brain;
  gatewayFor(play: PlayRecord): Promise<TradingGateway>;
  /** Where a Play's evidence purchases go; absent = Plays can't buy evidence. */
  evidenceFor?(play: PlayRecord): Promise<EvidenceProvider>;
  hasLiveAccess(userId: string): Promise<boolean>;
  limits: RuntimeLimits;
  clock?: () => number;
  log?: Logger;
  /** Minimum gap between status writes from price ticks (Realtime traffic). */
  statusEveryMs?: number;
  /** Live order status polling. */
  pollMs?: number;
  pollTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class PlayError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PlayError";
  }
}

const silent: Logger = { info() {}, warn() {}, error() {} };

export class PlayRuntime {
  private active = new Map<string, PlayRecord>();
  private watchers = new Map<string, () => void>();
  private lastStatusAt = new Map<string, number>();
  private chains = new Map<string, Promise<unknown>>();
  private tickQueued = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly log: Logger;

  constructor(private readonly d: RuntimeDeps) {
    this.log = d.log ?? silent;
  }

  private now() {
    return (this.d.clock ?? Date.now)();
  }

  // ------------------------------------------------------------ lifecycle

  /** Re-arms every non-terminal Play from the database, then starts ticking. */
  async start(tickMs = 1000) {
    for (const p of await this.d.store.listActive()) {
      await this.lock(p.id, () => this.rehydrate(p)).catch((err) =>
        this.log.error({ playId: p.id, err: String(err) }, "rehydrate failed"),
      );
    }
    this.timer = setInterval(() => void this.tick(), tickMs);
    this.log.info({ plays: this.active.size }, "play runtime started");
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const unsub of this.watchers.values()) unsub();
    this.watchers.clear();
  }

  /** Window opens, window closes, time triggers. Runs every second. */
  async tick() {
    await Promise.all(
      [...this.active.keys()].map((id) => {
        if (this.tickQueued.has(id)) return;
        this.tickQueued.add(id);
        return this.lock(id, async () => {
          this.tickQueued.delete(id);
          await this.tickOne(id);
        }).catch((err) => this.onFailure(id, "tick failed", err));
      }),
    );
  }

  // ------------------------------------------------------------- commands

  async create(userId: string, input: unknown, mode: Mode): Promise<PlayRecord> {
    const parsed = Cartridge.safeParse(input);
    if (!parsed.success) {
      throw new PlayError(400, "invalid cartridge", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    }
    const spec = parsed.data;
    if (mode === "live") {
      if (!this.d.limits.liveTradingEnabled) throw new PlayError(403, "Live trading is switched off on this engine.");
      if (!(await this.d.hasLiveAccess(userId))) throw new PlayError(403, "Connect a Coinbase key before arming a live Play.");
    }

    const start = this.now() + spec.window.startsInMin * 60_000;
    const end = start + spec.window.lastsMin * 60_000;
    let play = await this.d.store.insert({
      userId,
      title: spec.title,
      sentence: spec.sentence,
      spec,
      mode,
      windowStart: new Date(start).toISOString(),
      windowEnd: new Date(end).toISOString(),
      status: { phase: "entry", symbol: symbolOf(spec.action.product), headline: "Armed.", progress: 0 },
    });
    await this.tape(play, "state", { from: null, to: "armed", mode, title: spec.title });
    this.active.set(play.id, play);

    if (start <= this.now()) play = await this.lock(play.id, () => this.openWindow(play.id));
    return play;
  }

  async approve(userId: string, playId: string) {
    return this.lock(playId, async () => {
      const p = this.owned(userId, await this.fresh(playId));
      if (p.state !== "awaiting" || !p.pending) throw new PlayError(409, `Nothing to approve: this Play is ${p.state}.`);
      await this.tape(p, "approval", { decision: "approve", by: "user" });
      return this.execute(p, intentFrom(p.pending));
    });
  }

  async skip(userId: string, playId: string) {
    return this.lock(playId, async () => {
      const p = this.owned(userId, await this.fresh(playId));
      if (p.state !== "awaiting") throw new PlayError(409, `Nothing to skip: this Play is ${p.state}.`);
      await this.tape(p, "approval", { decision: "skip", by: "user" });
      return this.transition(p, "done", { pending: null, stateReason: "Skipped by you." }, { headline: "Skipped by you." });
    });
  }

  async pause(userId: string, playId: string) {
    return this.lock(playId, async () => {
      const p = this.owned(userId, await this.fresh(playId));
      if (p.state !== "armed" && p.state !== "watching") throw new PlayError(409, `Can't pause a Play that is ${p.state}.`);
      this.unwatch(p.id);
      return this.transition(p, "paused", { stateReason: "Paused by you." }, { resumeTo: p.state, headline: "Paused." });
    });
  }

  async resume(userId: string, playId: string) {
    return this.lock(playId, async () => {
      const p = this.owned(userId, await this.fresh(playId));
      if (p.state !== "paused") throw new PlayError(409, `This Play isn't paused; it is ${p.state}.`);
      if (this.now() >= Date.parse(p.windowEnd)) return this.transition(p, "expired", { stateReason: "Window closed while paused." });
      const to: PlayState = p.status.resumeTo === "watching" ? "watching" : "armed";
      let next = await this.transition(p, to, { stateReason: null }, { resumeTo: undefined, headline: to === "armed" ? "Armed." : this.describeWatch(p) });
      if (to === "watching") this.watch(next);
      else if (Date.parse(next.windowStart) <= this.now()) next = await this.openWindow(next.id);
      return next;
    });
  }

  async kill(userId: string, playId: string) {
    return this.lock(playId, async () => {
      const p = this.owned(userId, await this.fresh(playId));
      return this.killLocked(p, "Stopped by you.");
    });
  }

  /** The kill switch: every non-terminal Play this user has. */
  async killAll(userId: string): Promise<number> {
    const mine = [...this.active.values()].filter((p) => p.userId === userId);
    let n = 0;
    for (const p of mine) {
      await this.lock(p.id, async () => {
        const fresh = await this.fresh(p.id);
        if (!isTerminal(fresh.state)) {
          await this.killLocked(fresh, "Stopped by the kill switch.");
          n++;
        }
      });
    }
    return n;
  }

  async get(userId: string, playId: string) {
    const p = this.owned(userId, await this.fresh(playId));
    return { play: p, tape: await this.d.store.tape(p.id) };
  }

  list(userId: string) {
    return this.d.store.listForUser(userId);
  }

  // ------------------------------------------------------- engine-driven

  private async tickOne(id: string) {
    const p = this.active.get(id);
    if (!p || isTerminal(p.state)) return void this.active.delete(id);
    const now = this.now();

    if (now >= Date.parse(p.windowEnd) && p.state !== "executing") {
      // An exit-phase Ghost Play keeps its position when the window closes.
      const reason = p.status.phase === "exit" ? "Window closed; position kept." : "Window closed before the trigger.";
      await this.transition(p, "expired", { pending: null, stateReason: reason }, { headline: reason });
      return;
    }
    if (p.state === "armed" && now >= Date.parse(p.windowStart)) {
      await this.openWindow(id);
      return;
    }
    if (p.state === "watching" && p.status.phase === "entry" && p.spec.trigger.kind === "time") {
      const r = evaluateTrigger(p.spec.trigger, { anchorPrice: null, price: null, now, windowStart: Date.parse(p.windowStart) });
      if (r.fired) await this.fire(p, null, "Scheduled time reached");
      else await this.writeStatus(p, { progress: r.progress });
    }
  }

  private async openWindow(id: string): Promise<PlayRecord> {
    const p = await this.fresh(id);
    if (p.state !== "armed") return p;
    const product = watchedProduct(p.spec);
    let anchorPrice: number | undefined;
    if (product) {
      anchorPrice = this.d.feed.last(product)?.price ?? (await this.d.market.quote(product)).price;
      await this.tape(p, "observe", { product, anchorPrice, note: "window opened" });
    }
    let next = await this.transition(p, "watching", {}, { anchorPrice, price: anchorPrice, headline: "", progress: 0 });
    next = await this.writeStatus(next, { headline: this.describeWatch(next) }, true);
    this.watch(next);
    // Evaluate straight away against the opening price, so a condition that
    // already holds fires now rather than on the next tick (approval still
    // applies unless the cartridge says "never").
    if (p.spec.trigger.kind === "time") await this.tickOne(id);
    else if (product && anchorPrice !== undefined) await this.onPrice(id, { productId: product, price: anchorPrice, at: this.now() });
    return await this.fresh(id);
  }

  private async onPrice(id: string, tick: Tick) {
    const p = this.active.get(id);
    if (!p || p.state !== "watching") return;

    if (p.status.phase === "entry") {
      if (p.spec.trigger.kind === "time") return;
      const r = evaluateTrigger(p.spec.trigger, {
        anchorPrice: p.status.anchorPrice ?? null,
        price: tick.price,
        now: tick.at,
        windowStart: Date.parse(p.windowStart),
      });
      if (r.fired) return void (await this.fire(p, tick.price, this.describeTrigger(p, tick.price)));
      await this.writeStatus(p, { price: tick.price, progress: r.progress });
      return;
    }

    // Exit phase (Ghost only): watch take-profit / stop-loss.
    const exit = p.spec.exit;
    if (!exit) return;
    const ledger = ledgerOf(fillsOf(await this.d.store.tape(p.id)));
    if (ledger.positionBase <= 0 || ledger.entryPrice === null) return;
    const r = evaluateExit(exit, ledger.entryPrice, tick.price);
    if (r.fired) return void (await this.exitNow(p, tick.price, r.fired, ledger.positionBase));
    await this.writeStatus(p, { price: tick.price, progress: r.progress, pnlUsd: unrealizedPnlUsd(ledger, tick.price) });
  }

  private async fire(p: PlayRecord, price: number | null, summary: string) {
    this.unwatch(p.id);
    await this.tape(p, "trigger", { summary, price });
    let cur = await this.transition(p, "deciding", {}, { price: price ?? p.status.price, progress: 1, headline: `${summary}. Deciding…` });

    let decision;
    try {
      const evidence = await this.evidenceHandle(cur);
      decision = await this.d.brain.decide({ play: cur, spec: cur.spec, price, triggerSummary: summary, evidence });
    } catch (err) {
      await this.tape(cur, "error", { where: "brain", message: String(err) });
      return this.transition(cur, "failed", { stateReason: "The agent couldn't decide." }, { headline: "The agent couldn't decide." });
    }
    // Evidence spend lives on the evidence rows; repeating it here would count it twice.
    await this.tape(cur, "decision", { ...decision });
    cur = await this.fresh(cur.id);
    if (cur.state !== "deciding") return cur; // killed or expired while deciding

    if (decision.verdict === "skip") {
      return this.transition(cur, "done", { stateReason: decision.headline }, { headline: decision.headline });
    }
    if (decision.verdict === "wait") {
      const next = await this.transition(cur, "watching", {}, { headline: decision.headline });
      this.watch(next);
      return next;
    }

    const a = cur.spec.action;
    const intent: OrderIntent =
      a.side === "BUY"
        ? { purpose: "entry", side: "BUY", product: a.product, quoteUsd: Math.min(decision.quoteUsd ?? a.quoteUsd, a.quoteUsd), estUsd: Math.min(decision.quoteUsd ?? a.quoteUsd, a.quoteUsd) }
        : { purpose: "entry", side: "SELL", product: a.product, baseSize: Number(a.baseSize), estUsd: Number(a.baseSize) * (price ?? (await this.d.market.quote(a.product)).price) };

    const verdict = await this.leash(cur, intent);
    if (!verdict.ok) return this.leashReject(cur, verdict.reason);

    const ask = cur.spec.decision.ask;
    const needsApproval = ask === "always" || (typeof ask === "object" && intent.estUsd > ask.aboveUsd);
    if (!needsApproval) {
      await this.tape(cur, "approval", { decision: "approve", by: "policy", ask });
      return this.execute(cur, intent);
    }
    const pending: Pending = {
      purpose: "entry",
      side: intent.side,
      product: intent.product,
      quoteUsd: intent.quoteUsd,
      baseSize: intent.baseSize,
      estUsd: round2(intent.estUsd),
      headline: decision.headline,
      requestedAt: new Date(this.now()).toISOString(),
    };
    await this.tape(cur, "approval_request", { ...pending });
    return this.transition(cur, "awaiting", { pending }, { headline: decision.headline, pendingAmountUsd: pending.estUsd });
  }

  private async exitNow(p: PlayRecord, price: number, reason: ExitReason, positionBase: number) {
    this.unwatch(p.id);
    const label = reason === "take_profit" ? "Take-profit hit" : "Stop-loss hit";
    await this.tape(p, "trigger", { summary: label, price, exit: reason });
    const intent: OrderIntent = { purpose: "exit", side: "SELL", product: p.spec.action.product, baseSize: positionBase, estUsd: positionBase * price };
    const verdict = await this.leash(p, intent);
    if (!verdict.ok) return this.leashReject(p, verdict.reason);
    await this.tape(p, "approval", { decision: "approve", by: "policy", note: "exits are pre-approved when the Play is armed" });
    return this.execute(p, intent, label);
  }

  /** Preview → Leash re-check → order (idempotent) → poll → fill. */
  private async execute(p: PlayRecord, intent: OrderIntent, exitLabel?: string): Promise<PlayRecord> {
    let cur = await this.transition(p, "executing", { pending: null }, { pendingAmountUsd: undefined, headline: "Placing the order…" });
    const gateway = await this.d.gatewayFor(cur);
    const clientOrderId = `bl-${cur.id}-${intent.purpose}`;
    const req: OrderRequest = {
      side: intent.side,
      product: intent.product,
      clientOrderId,
      ...(intent.side === "BUY" ? { quoteSize: intent.quoteUsd!.toFixed(2) } : { baseSize: fmtBase(intent.baseSize!) }),
    };

    const preview = await gateway.preview(req).catch((err) => {
      this.log.warn({ playId: cur.id, err: String(err) }, "preview threw");
      return null;
    });
    await this.tape(cur, "order_preview", { request: req, preview });
    if (!preview && !gateway.simulated) {
      return this.finish(cur, "failed", "Coinbase couldn't preview this order, so it wasn't placed.");
    }

    // Live BUYs with exits carry them on the order, so Coinbase enforces them
    // even if this engine is asleep.
    if (!gateway.simulated && intent.purpose === "entry" && intent.side === "BUY" && cur.spec.exit && preview?.estAvgPrice) {
      const { takeProfit, stopLoss } = exitPrices(cur.spec.exit, preview.estAvgPrice);
      if (takeProfit) req.attachedTakeProfitPrice = takeProfit.toFixed(2);
      if (stopLoss) req.attachedStopLossPrice = stopLoss.toFixed(2);
    }

    // The idempotency key is written before the order exists: if two paths
    // ever race to place the same order, the second fails here, not at Coinbase.
    try {
      await this.tape(cur, "order", { clientOrderId, request: req, stage: "submitting" }, 0, clientOrderId);
    } catch (err) {
      await this.tape(cur, "error", { where: "order", message: `duplicate submission blocked: ${String(err)}` });
      return this.finish(cur, "failed", "This order was already submitted once; not sending it again.");
    }

    let orderId: string;
    try {
      orderId = (await gateway.place(req)).orderId;
    } catch (err) {
      await this.tape(cur, "error", { where: "order", message: String(err) });
      return this.finish(cur, "failed", "The order was rejected.");
    }
    await this.tape(cur, "order", { clientOrderId, orderId, stage: "accepted" });
    return this.settle(cur, gateway, orderId, intent, exitLabel);
  }

  private async settle(cur: PlayRecord, gateway: TradingGateway, orderId: string, intent: Pick<OrderIntent, "purpose" | "side" | "product">, exitLabel?: string) {
    const status = await this.pollUntilDone(gateway, orderId);
    if (!status || status.state !== "filled") {
      const why = !status ? "Order status unknown after waiting; check Coinbase." : `Order ${status.state}.`;
      await this.tape(cur, "error", { where: "fill", orderId, message: why });
      return this.finish(cur, "failed", why);
    }

    const fill: FillPayload = {
      side: intent.side,
      product: intent.product,
      purpose: intent.purpose,
      orderId,
      baseSize: status.filledBase,
      avgPrice: status.avgPrice ?? 0,
      valueUsd: round6(status.filledBase * (status.avgPrice ?? 0)),
      feeUsd: status.feeUsd,
    };
    await this.tape(cur, "fill", { ...fill });
    cur = await this.fresh(cur.id);
    const ledger = ledgerOf(fillsOf(await this.d.store.tape(cur.id)));

    if (cur.status.killRequested) {
      return this.finish(cur, "killed", ledger.positionBase > 0 ? "Stopped by you; position kept." : "Stopped by you.", ledger.realizedPnlUsd);
    }

    if (intent.purpose === "exit") {
      return this.finish(cur, "done", `${exitLabel ?? "Exited"}. Sold ${fmtBase(fill.baseSize)} at ${money(fill.avgPrice)}.`, ledger.realizedPnlUsd);
    }

    const bought = `Bought ${fmtBase(fill.baseSize)} ${symbolOf(fill.product)} at ${money(fill.avgPrice)}.`;
    if (intent.side === "BUY" && cur.spec.exit && ledger.entryPrice !== null) {
      const { takeProfit, stopLoss } = exitPrices(cur.spec.exit, ledger.entryPrice);
      const exits = [takeProfit && `TP ${money(takeProfit)}`, stopLoss && `SL ${money(stopLoss)}`].filter(Boolean).join(", ");
      if (!gateway.simulated) return this.finish(cur, "done", `${bought} Exits held by Coinbase (${exits}).`, 0);
      const next = await this.transition(cur, "watching", {}, { phase: "exit", progress: 0, pnlUsd: 0, headline: `${bought} Watching ${exits}.` });
      this.watch(next);
      return next;
    }
    return this.finish(cur, "done", bought, 0);
  }

  private async pollUntilDone(gateway: TradingGateway, orderId: string): Promise<OrderStatus | null> {
    const deadline = this.now() + (this.d.pollTimeoutMs ?? 30_000);
    const sleep = this.d.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    for (;;) {
      const s = await gateway.status(orderId).catch(() => null);
      if (s && s.state !== "open") return s;
      if (this.now() >= deadline) return s;
      await sleep(this.d.pollMs ?? 1000);
    }
  }

  // ------------------------------------------------------------ rehydrate

  private async rehydrate(p: PlayRecord) {
    this.active.set(p.id, p);
    switch (p.state) {
      case "watching":
        this.watch(p);
        return;
      case "deciding":
        // The engine died mid-decision. Nothing was ordered (orders only
        // happen in executing), so go back to watching and let it re-trigger.
        await this.tape(p, "note", { note: "engine restarted while deciding; watching again" });
        this.watch(await this.transition(p, "watching", {}, { headline: this.describeWatch(p) }));
        return;
      case "executing":
        await this.reconcile(p);
        return;
      default:
        return; // armed: tick opens it; awaiting / paused: wait for the user
    }
  }

  /** Never re-places an order blind: finds what was submitted and checks it. */
  private async reconcile(p: PlayRecord) {
    const tape = await this.d.store.tape(p.id);
    const orders = tape.filter((t) => t.kind === "order");
    const accepted = [...orders].reverse().find((t) => t.payload.stage === "accepted");
    const submitted = [...orders].reverse().find((t) => t.payload.stage === "submitting");
    const purpose = String(submitted?.payload.clientOrderId ?? "").endsWith("-exit") ? "exit" : "entry";

    if (accepted && submitted) {
      const req = submitted.payload.request as OrderRequest;
      await this.tape(p, "note", { note: "engine restarted mid-order; checking its status" });
      return this.settle(p, await this.d.gatewayFor(p), String(accepted.payload.orderId), { purpose, side: req.side, product: req.product });
    }
    const why = submitted
      ? "The engine restarted while submitting the order; check Coinbase before retrying."
      : "The engine restarted before the order was placed.";
    await this.tape(p, "error", { where: "restart", message: why });
    return this.finish(p, "failed", why);
  }

  // --------------------------------------------------------------- helpers

  private async killLocked(p: PlayRecord, reason: string) {
    if (isTerminal(p.state)) return p;
    if (p.state === "executing") {
      // Let the order resolve; settle() applies the kill afterwards.
      return this.writeStatus(p, { killRequested: true, headline: "Stopping after this order resolves…" }, true);
    }
    this.unwatch(p.id);
    return this.transition(p, "killed", { pending: null, stateReason: reason }, { headline: reason, pendingAmountUsd: undefined });
  }

  /** The Play's evidence budget left, from the Tape, and a receipt writer. */
  private async evidenceHandle(p: PlayRecord): Promise<EvidenceHandle | undefined> {
    if (!this.d.evidenceFor || p.spec.evidence.senses.length === 0) return undefined;
    const budget = Math.min(p.spec.evidence.budgetUsdc, p.spec.leash.maxEvidenceUsdc);
    const spent = (await this.d.store.tape(p.id)).filter((t) => t.kind === "evidence").reduce((s, t) => s + (t.costUsdc ?? 0), 0);
    const remainingUsdc = Math.max(0, Math.round((budget - spent) * 1e6) / 1e6);
    if (remainingUsdc <= 0) return undefined;
    const provider = await this.d.evidenceFor(p);
    return {
      provider,
      senses: p.spec.evidence.senses,
      remainingUsdc,
      record: (r) =>
        this.d.store.appendTape({
          playId: p.id,
          userId: p.userId,
          kind: "evidence",
          // A simulated purchase is labelled simulated even inside a live Play.
          simulated: r.simulated || p.mode === "ghost",
          costUsdc: r.costUsdc,
          payload: { senseId: r.senseId, provider: r.provider, query: r.query, costUsdc: r.costUsdc, simulated: r.simulated, excerpt: r.content.slice(0, 400) },
          idempotencyKey: `ev-${r.idempotencyKey}`,
        }),
    };
  }

  private async leash(p: PlayRecord, intent: OrderIntent) {
    const ledger = ledgerOf(fillsOf(await this.d.store.tape(p.id)));
    return checkOrder(intent, p.spec.leash, {
      playSpentUsd: ledger.spentUsd,
      playPositionBase: ledger.positionBase,
      hardMaxOrderUsd: p.mode === "live" ? this.d.limits.hardMaxOrderUsd : Number.POSITIVE_INFINITY,
      availableUsd: p.mode === "ghost" ? await this.d.store.ghostCashUsd(p.userId) : undefined,
    });
  }

  private async leashReject(p: PlayRecord, reason: string) {
    await this.tape(p, "leash_reject", { reason });
    return this.finish(p, "failed", `Leash: ${reason}.`);
  }

  private async finish(p: PlayRecord, to: PlayState, reason: string, pnlUsd?: number) {
    this.unwatch(p.id);
    return this.transition(p, to, { pending: null, stateReason: reason }, { headline: reason, pnlUsd, pendingAmountUsd: undefined, killRequested: undefined });
  }

  private async transition(p: PlayRecord, to: PlayState, patch: PlayPatch = {}, status: Partial<PlayStatus> = {}) {
    assertTransition(p.state, to);
    const next = await this.d.store.update(p.id, { ...patch, state: to, status: clean({ ...p.status, ...status }) }, p.state);
    await this.tape(next, "state", { from: p.state, to, reason: patch.stateReason ?? undefined });
    if (isTerminal(to)) {
      this.active.delete(p.id);
      this.unwatch(p.id);
    } else {
      this.active.set(p.id, next);
    }
    this.lastStatusAt.set(p.id, this.now());
    return next;
  }

  /** Display-only status writes, throttled so price ticks don't flood Realtime. */
  private async writeStatus(p: PlayRecord, status: Partial<PlayStatus>, force = false) {
    const last = this.lastStatusAt.get(p.id) ?? 0;
    const merged = clean({ ...p.status, ...status });
    if (!force && this.now() - last < (this.d.statusEveryMs ?? 10_000)) {
      this.active.set(p.id, { ...p, status: merged });
      return { ...p, status: merged };
    }
    const next = await this.d.store.update(p.id, { status: merged });
    this.lastStatusAt.set(p.id, this.now());
    this.active.set(p.id, next);
    return next;
  }

  private watch(p: PlayRecord) {
    this.unwatch(p.id);
    const product = p.status.phase === "exit" ? p.spec.action.product : watchedProduct(p.spec);
    if (!product) return;
    const unsub = this.d.feed.subscribe(product, (tick) =>
      void this.lock(p.id, () => this.onPrice(p.id, tick)).catch((err) => this.onFailure(p.id, "price handling failed", err)),
    );
    this.watchers.set(p.id, unsub);
  }

  private unwatch(id: string) {
    this.watchers.get(id)?.();
    this.watchers.delete(id);
  }

  private tape(p: PlayRecord, kind: TapeEvent["kind"], payload: Record<string, unknown>, costUsdc = 0, idempotencyKey?: string) {
    return this.d.store.appendTape({ playId: p.id, userId: p.userId, kind, simulated: p.mode === "ghost", costUsdc, payload, idempotencyKey });
  }

  private async fresh(id: string): Promise<PlayRecord> {
    const p = this.active.get(id) ?? (await this.d.store.get(id));
    if (!p) throw new PlayError(404, "No such Play.");
    return p;
  }

  private owned(userId: string, p: PlayRecord) {
    if (p.userId !== userId) throw new PlayError(404, "No such Play.");
    return p;
  }

  /**
   * Logs a background failure, and forgets the Play if its row is gone
   * (e.g. its user was deleted), so it doesn't fail again every second.
   */
  private async onFailure(id: string, what: string, err: unknown) {
    const gone = await this.d.store.get(id).then((p) => p === null, () => false);
    if (gone) {
      this.active.delete(id);
      this.unwatch(id);
      this.log.warn({ playId: id }, "play no longer exists; forgotten");
      return;
    }
    this.log.error({ playId: id, err: String(err) }, what);
  }

  private lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(id) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.chains.set(id, next.catch(() => undefined));
    return next;
  }

  private describeWatch(p: PlayRecord): string {
    const t = p.spec.trigger;
    if (p.status.phase === "exit") return "Watching exits.";
    switch (t.kind) {
      case "price_cross":
        return `Watching for ${symbolOf(t.product)} ${t.direction === "above" ? "≥" : "≤"} ${money(t.price)}.`;
      case "pct_move": {
        const dir = t.direction === "either" ? "" : t.direction === "up" ? " up" : " down";
        const from = p.status.anchorPrice ? ` from ${money(p.status.anchorPrice)}` : "";
        return `Watching for a ${t.pct}%${dir} move in ${symbolOf(t.product)}${from}.`;
      }
      case "time":
        return t.afterMin === 0 ? "Acting now." : `Acting in ${t.afterMin} min.`;
    }
  }

  private describeTrigger(p: PlayRecord, price: number): string {
    const t = p.spec.trigger;
    if (t.kind === "price_cross") return `${symbolOf(t.product)} crossed ${money(t.price)}`;
    if (t.kind === "pct_move" && p.status.anchorPrice) {
      const change = ((price - p.status.anchorPrice) / p.status.anchorPrice) * 100;
      const digits = Math.abs(change) < 1 ? 2 : 1;
      return `${symbolOf(t.product)} moved ${change >= 0 ? "+" : ""}${change.toFixed(digits)}%`;
    }
    return "Trigger hit";
  }
}

function intentFrom(p: Pending): OrderIntent {
  return { purpose: "entry", side: p.side, product: p.product, quoteUsd: p.quoteUsd, baseSize: p.baseSize, estUsd: p.estUsd };
}

/** Drops undefined keys so JSON status stays tidy. */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const fmtBase = (x: number) => x.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
const money = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
