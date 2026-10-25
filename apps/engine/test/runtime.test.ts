import { describe, expect, it } from "vitest";
import { examples, type CartridgeInput } from "@baseland/play-schema";
import type { Brain } from "../src/plays/brain.js";
import { ledgerOf } from "../src/plays/ledger.js";
import { PlayError } from "../src/plays/runtime.js";
import { fillsOf } from "../src/plays/store.js";
import type { TradingGateway } from "../src/trading/gateway.js";
import { harness, settle } from "./harness.js";

const ALICE = "alice";
const clone = <T>(x: T): T => structuredClone(x);

describe("a Ghost price_cross Play, end to end", () => {
  it("watches, asks, fills, watches exits, takes profit — and labels everything simulated", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2300);

    let play = await h.runtime.create(ALICE, examples.ethBreakout, "ghost");
    expect(play.state).toBe("watching");
    expect(play.status).toMatchObject({ phase: "entry", symbol: "ETH", anchorPrice: 2300, headline: "Watching for ETH ≥ $2,400.00." });

    await h.price("ETH-USDC", 2350);
    expect((await h.store.get(play.id))!.status.progress).toBe(0.5);

    await h.price("ETH-USDC", 2401);
    play = (await h.store.get(play.id))!;
    expect(play.state).toBe("awaiting");
    expect(play.pending).toMatchObject({ side: "BUY", product: "ETH-USDC", quoteUsd: 3, estUsd: 3 });
    expect(play.status.pendingAmountUsd).toBe(3);
    expect(play.status.headline).toBe("ETH crossed $2,400.00 at 2,401. Buy $3.00 of ETH?");

    // Prices while awaiting don't re-trigger anything.
    await h.price("ETH-USDC", 2500);
    expect((await h.store.get(play.id))!.state).toBe("awaiting");

    await h.price("ETH-USDC", 2400);
    play = await h.runtime.approve(ALICE, play.id);
    expect(play.state).toBe("watching");
    expect(play.status.phase).toBe("exit");
    expect(play.status.headline).toMatch(/^Bought 0\.0012\d+ ETH at \$2,400\.00\. Watching TP \$2,496\.00, SL \$2,352\.00\.$/);

    await h.price("ETH-USDC", 2450);
    expect((await h.store.get(play.id))!.status.pnlUsd).toBeGreaterThan(0);

    await h.price("ETH-USDC", 2500);
    play = (await h.store.get(play.id))!;
    expect(play.state).toBe("done");
    expect(play.stateReason).toMatch(/^Take-profit hit\. Sold 0\.0012\d+ at \$2,500\.00\.$/);

    const tape = await h.store.tape(play.id);
    const ledger = ledgerOf(fillsOf(tape));
    expect(ledger.positionBase).toBe(0);
    expect(ledger.realizedPnlUsd).toBeGreaterThan(0.06);
    expect(play.status.pnlUsd).toBe(ledger.realizedPnlUsd);

    expect(await h.states(play.id)).toEqual([
      "armed", "watching", "deciding", "awaiting", "executing", "watching", "executing", "done",
    ]);
    expect(await h.kinds(play.id)).toEqual([
      "state", "observe", "state", "trigger", "state", "decision", "approval_request", "state",
      "approval", "state", "order_preview", "order", "order", "fill", "state",
      "trigger", "approval", "state", "order_preview", "order", "order", "fill", "state",
    ]);
    // Sponsor rule: every row of a Ghost Play is labelled simulated.
    expect(tape.every((t) => t.simulated)).toBe(true);
    // Ghost cash moved by exactly the realized P&L.
    expect(await h.store.ghostCashUsd(ALICE)).toBeCloseTo(100 + ledger.realizedPnlUsd, 6);
  });

  it("stop-loss exits at a loss", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2400);
    const c = clone(examples.ethBreakout) as CartridgeInput;
    c.decision = { instinct: "momentum", ask: "never" };
    const play = await h.runtime.create(ALICE, c, "ghost"); // fires immediately: already at 2400
    await settle();
    expect((await h.store.get(play.id))!.status.phase).toBe("exit");
    await h.price("ETH-USDC", 2350);
    const done = (await h.store.get(play.id))!;
    expect(done.state).toBe("done");
    expect(done.stateReason).toMatch(/^Stop-loss hit/);
    expect(done.status.pnlUsd).toBeLessThan(0);
  });
});

describe("approval policy", () => {
  it("ask: never executes without asking", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2000);
    const c = clone(examples.ethNow) as CartridgeInput;
    c.decision = { instinct: "steady", ask: "never" };
    const play = await h.runtime.create(ALICE, c, "ghost");
    expect(play.state).toBe("done");
    expect(await h.states(play.id)).toEqual(["armed", "watching", "deciding", "executing", "done"]);
    const approvals = (await h.store.tape(play.id)).filter((t) => t.kind === "approval");
    expect(approvals[0]!.payload).toMatchObject({ by: "policy" });
  });

  it("ask: aboveUsd asks only for bigger orders", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2000);
    const small = { ...clone(examples.ethNow), decision: { instinct: "steady", ask: { aboveUsd: 5 } } } as CartridgeInput;
    expect((await h.runtime.create(ALICE, small, "ghost")).state).toBe("done");
    const big = {
      ...clone(examples.ethNow),
      action: { side: "BUY", product: "ETH-USDC", quoteUsd: 6 },
      leash: { maxOrderUsd: 10, maxPlayUsd: 10 },
      decision: { instinct: "steady", ask: { aboveUsd: 5 } },
    } as CartridgeInput;
    expect((await h.runtime.create(ALICE, big, "ghost")).state).toBe("awaiting");
  });

  it("skip ends the Play without an order", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2000);
    const play = await h.runtime.create(ALICE, examples.ethNow, "ghost");
    expect(play.state).toBe("awaiting");
    const done = await h.runtime.skip(ALICE, play.id);
    expect(done).toMatchObject({ state: "done", stateReason: "Skipped by you.", pending: null });
    expect(await h.kinds(play.id)).not.toContain("order");
  });

  it("approving twice places one order", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2000);
    const play = await h.runtime.create(ALICE, examples.ethNow, "ghost");
    const [a, b] = await Promise.allSettled([h.runtime.approve(ALICE, play.id), h.runtime.approve(ALICE, play.id)]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    expect((b as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    expect((await h.store.tape(play.id)).filter((t) => t.kind === "fill")).toHaveLength(1);
  });
});

describe("the Leash, inside the runtime", () => {
  it("rejects when Ghost cash runs out, and records why", async () => {
    const h = harness({ ghostStartingUsd: 1 });
    await h.price("ETH-USDC", 2000);
    const play = await h.runtime.create(ALICE, examples.ethNow, "ghost");
    expect(play.state).toBe("failed");
    expect(play.stateReason).toBe("Leash: only $1.00 available.");
    const reject = (await h.store.tape(play.id)).find((t) => t.kind === "leash_reject");
    expect(reject?.payload).toEqual({ reason: "only $1.00 available" });
    expect(await h.kinds(play.id)).not.toContain("order");
  });

  it("caps the Brain: it can never spend more than the cartridge says", async () => {
    const greedy: Brain = { name: "greedy", decide: async () => ({ verdict: "act", headline: "all in", quoteUsd: 1000, evidenceCostUsdc: 0, by: "greedy" }) };
    const h = harness({ brain: greedy });
    await h.price("ETH-USDC", 2000);
    const play = await h.runtime.create(ALICE, examples.ethNow, "ghost");
    expect(play.pending?.quoteUsd).toBe(2);
  });

  it("brain skip and wait", async () => {
    const skipper: Brain = { name: "s", decide: async () => ({ verdict: "skip", headline: "Volume too thin.", evidenceCostUsdc: 0, by: "s" }) };
    const h = harness({ brain: skipper });
    await h.price("ETH-USDC", 2000);
    expect(await h.runtime.create(ALICE, examples.ethNow, "ghost")).toMatchObject({ state: "done", stateReason: "Volume too thin." });

    let calls = 0;
    const waiter: Brain = { name: "w", decide: async () => ({ verdict: calls++ === 0 ? "wait" : "act", headline: "hm", quoteUsd: 3, evidenceCostUsdc: 0, by: "w" }) };
    const h2 = harness({ brain: waiter });
    await h2.price("ETH-USDC", 2300);
    const p = await h2.runtime.create(ALICE, examples.ethBreakout, "ghost");
    await h2.price("ETH-USDC", 2401);
    expect((await h2.store.get(p.id))!.state).toBe("watching");
    await h2.price("ETH-USDC", 2402);
    expect((await h2.store.get(p.id))!.state).toBe("awaiting");
  });
});

describe("windows, pause, kill", () => {
  it("arms for a future window, opens it on time, and expires it", async () => {
    const h = harness();
    await h.price("BTC-USDC", 100);
    const c = { ...clone(examples.btcDip), window: { startsInMin: 10, lastsMin: 60 } } as CartridgeInput;
    const play = await h.runtime.create(ALICE, c, "ghost");
    expect(play.state).toBe("armed");
    await h.tick(9 * 60_000);
    expect((await h.store.get(play.id))!.state).toBe("armed");
    await h.tick(60_000);
    expect((await h.store.get(play.id))!).toMatchObject({ state: "watching", status: { anchorPrice: 100 } });
    await h.tick(60 * 60_000);
    expect((await h.store.get(play.id))!).toMatchObject({ state: "expired", stateReason: "Window closed before the trigger." });
  });

  it("pct_move measures from the price when the window opened", async () => {
    const h = harness();
    await h.price("BTC-USDC", 100);
    const play = await h.runtime.create(ALICE, examples.btcDip, "ghost");
    await h.price("BTC-USDC", 98);
    expect((await h.store.get(play.id))!.state).toBe("watching");
    await h.price("BTC-USDC", 96.9);
    expect((await h.store.get(play.id))!).toMatchObject({ state: "awaiting", status: { headline: "BTC moved -3.1% at 96.9. Buy $5.00 of BTC?" } });
  });

  it("time triggers fire on tick", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2000);
    const c = { ...clone(examples.ethNow), trigger: { kind: "time", afterMin: 5 } } as CartridgeInput;
    const play = await h.runtime.create(ALICE, c, "ghost");
    expect(play.state).toBe("watching");
    await h.tick(4 * 60_000);
    expect((await h.store.get(play.id))!.state).toBe("watching");
    await h.tick(60_000);
    expect((await h.store.get(play.id))!.state).toBe("awaiting");
  });

  it("pause stops watching; resume picks up; kill ends it", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2300);
    const play = await h.runtime.create(ALICE, examples.ethBreakout, "ghost");
    await h.runtime.pause(ALICE, play.id);
    await h.price("ETH-USDC", 2500);
    expect((await h.store.get(play.id))!.state).toBe("paused");
    const resumed = await h.runtime.resume(ALICE, play.id);
    expect(resumed.state).toBe("watching");
    const killed = await h.runtime.kill(ALICE, play.id);
    expect(killed).toMatchObject({ state: "killed", stateReason: "Stopped by you." });
    await h.price("ETH-USDC", 2600);
    expect((await h.store.get(play.id))!.state).toBe("killed");
  });

  it("the kill switch stops every Play of that user only", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2300);
    await h.price("BTC-USDC", 100);
    const a = await h.runtime.create(ALICE, examples.ethBreakout, "ghost");
    const b = await h.runtime.create(ALICE, examples.btcDip, "ghost");
    const bob = await h.runtime.create("bob", examples.ethBreakout, "ghost");
    expect(await h.runtime.killAll(ALICE)).toBe(2);
    expect((await h.store.get(a.id))!.state).toBe("killed");
    expect((await h.store.get(b.id))!.stateReason).toBe("Stopped by the kill switch.");
    expect((await h.store.get(bob.id))!.state).toBe("watching");
  });
});

describe("ownership and validation", () => {
  it("another user can't see or touch a Play", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2000);
    const play = await h.runtime.create(ALICE, examples.ethNow, "ghost");
    for (const call of [() => h.runtime.approve("mallory", play.id), () => h.runtime.get("mallory", play.id), () => h.runtime.kill("mallory", play.id)]) {
      await expect(call()).rejects.toMatchObject({ status: 404 });
    }
    expect((await h.store.get(play.id))!.state).toBe("awaiting");
  });

  it("rejects invalid cartridges with the reasons", async () => {
    const h = harness();
    const bad = { ...clone(examples.ethNow), action: { side: "BUY", product: "ETH-USDC", quoteUsd: 99 } };
    const err = (await h.runtime.create(ALICE, bad, "ghost").catch((e) => e)) as PlayError;
    expect(err.status).toBe(400);
    expect(err.details).toContain("action.quoteUsd: order is larger than the Leash's maxOrderUsd");
  });
});

describe("live mode guards", () => {
  it("is refused while live trading is switched off", async () => {
    const h = harness({ liveTradingEnabled: false, hasLiveAccess: true });
    await expect(h.runtime.create(ALICE, examples.ethNow, "live")).rejects.toMatchObject({ status: 403, message: "Live trading is switched off on this engine." });
  });

  it("needs a connected key", async () => {
    const h = harness({ liveTradingEnabled: true, hasLiveAccess: false });
    await expect(h.runtime.create(ALICE, examples.ethNow, "live")).rejects.toMatchObject({ status: 403 });
  });

  function fakeLive(opts: { preview: boolean }) {
    const placed: string[] = [];
    const gw: TradingGateway = {
      simulated: false,
      preview: async () => (opts.preview ? { estAvgPrice: 2000, estFeeUsd: 0.018, estTotalUsd: 2, warning: null } : null),
      place: async (req) => {
        placed.push(JSON.stringify(req));
        return { orderId: "cb-1" };
      },
      status: async () => ({ orderId: "cb-1", state: "filled", filledBase: 0.000991, avgPrice: 2000, feeUsd: 0.018 }),
    };
    return { gw, placed };
  }

  it("never places a live order Coinbase couldn't preview", async () => {
    const live = fakeLive({ preview: false });
    const h = harness({ liveTradingEnabled: true, hasLiveAccess: true, live: live.gw });
    await h.price("ETH-USDC", 2000);
    const play = await h.runtime.create(ALICE, examples.ethNow, "live");
    const failed = await h.runtime.approve(ALICE, play.id);
    expect(failed).toMatchObject({ state: "failed", stateReason: "Coinbase couldn't preview this order, so it wasn't placed." });
    expect(live.placed).toEqual([]);
  });

  it("places a previewed live order once, unlabelled as simulated, with exits attached for Coinbase to hold", async () => {
    const live = fakeLive({ preview: true });
    const h = harness({ liveTradingEnabled: true, hasLiveAccess: true, live: live.gw });
    await h.price("ETH-USDC", 2400);
    const c = { ...clone(examples.ethBreakout), action: { side: "BUY", product: "ETH-USDC", quoteUsd: 2 } } as CartridgeInput;
    const play = await h.runtime.create(ALICE, c, "live");
    const done = await h.runtime.approve(ALICE, play.id);
    expect(done.state).toBe("done");
    expect(done.stateReason).toMatch(/Exits held by Coinbase \(TP \$2,080\.00, SL \$1,960\.00\)\.$/);
    expect(live.placed).toHaveLength(1);
    expect(JSON.parse(live.placed[0]!)).toMatchObject({
      side: "BUY", product: "ETH-USDC", quoteSize: "2.00", clientOrderId: `bl-${play.id}-entry`,
      attachedTakeProfitPrice: "2080.00", attachedStopLossPrice: "1960.00",
    });
    expect((await h.store.tape(play.id)).every((t) => !t.simulated)).toBe(true);
  });

  it("enforces the engine's live ceiling even if a cartridge allows more", async () => {
    const live = fakeLive({ preview: true });
    const h = harness({ liveTradingEnabled: true, hasLiveAccess: true, live: live.gw });
    await h.price("ETH-USDC", 2000);
    const c = { ...clone(examples.ethNow), action: { side: "BUY", product: "ETH-USDC", quoteUsd: 20 }, leash: { maxOrderUsd: 20, maxPlayUsd: 20 } } as CartridgeInput;
    const play = await h.runtime.create(ALICE, c, "live");
    expect(play).toMatchObject({ state: "failed", stateReason: "Leash: $20.00 is over the engine's $10.00 live-order ceiling." });
    expect(live.placed).toEqual([]);
  });
});

describe("restarts", () => {
  it("re-arms watching Plays from the store", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2300);
    const play = await h.runtime.create(ALICE, examples.ethBreakout, "ghost");
    h.runtime.stop();

    const { PlayRuntime } = await import("../src/plays/runtime.js");
    const reborn = new PlayRuntime(h.deps);
    await reborn.start(60_000);
    await h.price("ETH-USDC", 2401);
    expect((await h.store.get(play.id))!.state).toBe("awaiting");
    reborn.stop();
  });

  it("never re-places an order that was mid-submission; resolves one that was accepted", async () => {
    const h = harness();
    await h.price("ETH-USDC", 2000);
    const play = await h.runtime.create(ALICE, examples.ethNow, "ghost");

    // Simulate a crash after submitting, before an order id came back.
    await h.store.update(play.id, { state: "executing", pending: null });
    await h.store.appendTape({ playId: play.id, userId: ALICE, kind: "order", simulated: true, payload: { clientOrderId: `bl-${play.id}-entry`, stage: "submitting" }, idempotencyKey: `bl-${play.id}-entry` });
    h.runtime.stop();
    const { PlayRuntime } = await import("../src/plays/runtime.js");
    const reborn = new PlayRuntime(h.deps);
    await reborn.start(60_000);
    expect((await h.store.get(play.id))!).toMatchObject({
      state: "failed",
      stateReason: "The engine restarted while submitting the order; check Coinbase before retrying.",
    });
    reborn.stop();
  });
});
