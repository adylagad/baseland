import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cartridge, Mode, PlayState } from "@baseland/play-schema";
import { isTerminal } from "@baseland/play-schema";
import type { FillPayload } from "./ledger.js";

// ------------------------------------------------------------------ types

/** The order a Play is waiting for the user to approve. */
export interface Pending {
  purpose: "entry";
  side: "BUY" | "SELL";
  product: string;
  quoteUsd?: number;
  baseSize?: number;
  estUsd: number;
  headline: string;
  requestedAt: string;
}

/**
 * Display snapshot for the Live Activity and lists. Not a source of truth:
 * money is derived from the Tape. `anchorPrice` is the one durable reference
 * kept here (the price when the window opened), so pct_move survives restarts.
 */
export interface PlayStatus {
  phase: "entry" | "exit";
  symbol: string;
  headline: string;
  progress: number;
  price?: number;
  anchorPrice?: number;
  pnlUsd?: number;
  pendingAmountUsd?: number;
  /** Where to resume after a pause. */
  resumeTo?: PlayState;
  /** A kill requested mid-order, applied once the order resolves. */
  killRequested?: boolean;
}

export interface PlayRecord {
  id: string;
  userId: string;
  title: string;
  sentence: Cartridge["sentence"];
  spec: Cartridge;
  mode: Mode;
  state: PlayState;
  stateReason: string | null;
  pending: Pending | null;
  status: PlayStatus;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  updatedAt: string;
}

export type NewPlay = Pick<PlayRecord, "userId" | "title" | "sentence" | "spec" | "mode" | "status" | "windowStart" | "windowEnd">;

export type PlayPatch = Partial<Pick<PlayRecord, "state" | "stateReason" | "pending" | "status">>;

export type TapeKind =
  | "state" | "observe" | "trigger" | "evidence" | "decision" | "approval_request" | "approval"
  | "leash_reject" | "order_preview" | "order" | "fill" | "error" | "note";

export interface TapeEvent {
  playId: string;
  userId: string;
  kind: TapeKind;
  simulated: boolean;
  costUsdc?: number;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface TapeRow extends TapeEvent {
  id: number;
  at: string;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export interface PlayStore {
  insert(play: NewPlay): Promise<PlayRecord>;
  get(id: string): Promise<PlayRecord | null>;
  listForUser(userId: string): Promise<PlayRecord[]>;
  /** Every non-terminal Play, all users: what the runtime re-arms on boot. */
  listActive(): Promise<PlayRecord[]>;
  /**
   * Updates a Play. With `expectState`, only if it is still in that state;
   * otherwise ConflictError. This is what makes transitions race-safe.
   */
  update(id: string, patch: PlayPatch, expectState?: PlayState): Promise<PlayRecord>;
  /** Appends to the Tape. A duplicate idempotencyKey is a ConflictError. */
  appendTape(e: TapeEvent): Promise<void>;
  tape(playId: string): Promise<TapeRow[]>;
  /** Ghost cash: the profile's starting amount, minus/plus every Ghost fill. */
  ghostCashUsd(userId: string): Promise<number>;
}

export const fillsOf = (tape: TapeRow[]): FillPayload[] =>
  tape.filter((t) => t.kind === "fill").map((t) => t.payload as unknown as FillPayload);

export function cashAfterFills(startingUsd: number, fills: FillPayload[]): number {
  let cash = startingUsd;
  for (const f of fills) cash += f.side === "BUY" ? -(f.valueUsd + f.feeUsd) : f.valueUsd - f.feeUsd;
  return Math.round(cash * 1e6) / 1e6;
}

// ----------------------------------------------------------------- memory

export function memoryPlayStore(opts: { ghostStartingUsd?: number } = {}) {
  const plays = new Map<string, PlayRecord>();
  const tape: TapeRow[] = [];
  const keys = new Set<string>();
  let seq = 0;
  const now = () => new Date().toISOString();
  const copy = <T>(x: T): T => structuredClone(x);

  const store: PlayStore & { plays: Map<string, PlayRecord>; tapeRows: TapeRow[] } = {
    plays,
    tapeRows: tape,
    async insert(p) {
      const rec: PlayRecord = { ...copy(p), id: randomUUID(), state: "armed", stateReason: null, pending: null, createdAt: now(), updatedAt: now() };
      plays.set(rec.id, rec);
      return copy(rec);
    },
    async get(id) {
      const p = plays.get(id);
      return p ? copy(p) : null;
    },
    async listForUser(userId) {
      return [...plays.values()].filter((p) => p.userId === userId).map(copy).reverse();
    },
    async listActive() {
      return [...plays.values()].filter((p) => !isTerminal(p.state)).map(copy);
    },
    async update(id, patch, expectState) {
      const p = plays.get(id);
      if (!p) throw new ConflictError(`no play ${id}`);
      if (expectState && p.state !== expectState) throw new ConflictError(`play ${id} is ${p.state}, not ${expectState}`);
      Object.assign(p, copy(patch), { updatedAt: now() });
      return copy(p);
    },
    async appendTape(e) {
      if (e.idempotencyKey) {
        if (keys.has(e.idempotencyKey)) throw new ConflictError(`duplicate idempotency key ${e.idempotencyKey}`);
        keys.add(e.idempotencyKey);
      }
      tape.push({ ...copy(e), id: ++seq, at: now() });
    },
    async tape(playId) {
      return tape.filter((t) => t.playId === playId).map(copy);
    },
    async ghostCashUsd(userId) {
      const fills = fillsOf(tape.filter((t) => t.userId === userId && t.simulated));
      return cashAfterFills(opts.ghostStartingUsd ?? 100, fills);
    },
  };
  return store;
}

// --------------------------------------------------------------- supabase

type Row = {
  id: string;
  user_id: string;
  title: string;
  sentence: Cartridge["sentence"];
  spec: Cartridge;
  mode: Mode;
  state: PlayState;
  state_reason: string | null;
  pending: Pending | null;
  status: PlayStatus;
  window_start: string;
  window_end: string;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Row): PlayRecord => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  sentence: r.sentence,
  spec: r.spec,
  mode: r.mode,
  state: r.state,
  stateReason: r.state_reason,
  pending: r.pending,
  status: r.status,
  windowStart: r.window_start,
  windowEnd: r.window_end,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const TERMINAL = "(done,killed,expired,failed)";

export function supabasePlayStore(db: SupabaseClient): PlayStore {
  const fail = (what: string, error: { message: string; code?: string }) => {
    if (error.code === "23505") return new ConflictError(`${what}: duplicate`);
    return new Error(`${what} failed: ${error.message}`);
  };

  return {
    async insert(p) {
      const { data, error } = await db
        .from("plays")
        .insert({
          user_id: p.userId,
          title: p.title,
          sentence: p.sentence,
          spec: p.spec,
          mode: p.mode,
          status: p.status,
          window_start: p.windowStart,
          window_end: p.windowEnd,
        })
        .select()
        .single();
      if (error) throw fail("insert play", error);
      return fromRow(data as Row);
    },
    async get(id) {
      const { data, error } = await db.from("plays").select().eq("id", id).maybeSingle();
      if (error) throw fail("get play", error);
      return data ? fromRow(data as Row) : null;
    },
    async listForUser(userId) {
      const { data, error } = await db.from("plays").select().eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
      if (error) throw fail("list plays", error);
      return (data as Row[]).map(fromRow);
    },
    async listActive() {
      const { data, error } = await db.from("plays").select().not("state", "in", TERMINAL);
      if (error) throw fail("list active plays", error);
      return (data as Row[]).map(fromRow);
    },
    async update(id, patch, expectState) {
      const row: Record<string, unknown> = {};
      if (patch.state !== undefined) row.state = patch.state;
      if (patch.stateReason !== undefined) row.state_reason = patch.stateReason;
      if (patch.pending !== undefined) row.pending = patch.pending;
      if (patch.status !== undefined) row.status = patch.status;
      let q = db.from("plays").update(row).eq("id", id);
      if (expectState) q = q.eq("state", expectState);
      const { data, error } = await q.select().maybeSingle();
      if (error) throw fail("update play", error);
      if (!data) throw new ConflictError(`play ${id} changed underneath us (expected ${expectState ?? "any"})`);
      return fromRow(data as Row);
    },
    async appendTape(e) {
      const { error } = await db.from("tape").insert({
        play_id: e.playId,
        user_id: e.userId,
        kind: e.kind,
        simulated: e.simulated,
        cost_usdc: e.costUsdc ?? 0,
        payload: e.payload,
        idempotency_key: e.idempotencyKey ?? null,
      });
      if (error) throw fail("append tape", error);
    },
    async tape(playId) {
      const { data, error } = await db.from("tape").select().eq("play_id", playId).order("id");
      if (error) throw fail("read tape", error);
      return (data as Record<string, unknown>[]).map((r) => ({
        id: r.id as number,
        at: r.at as string,
        playId: r.play_id as string,
        userId: r.user_id as string,
        kind: r.kind as TapeKind,
        simulated: r.simulated as boolean,
        costUsdc: Number(r.cost_usdc),
        payload: r.payload as Record<string, unknown>,
        idempotencyKey: (r.idempotency_key as string | null) ?? undefined,
      }));
    },
    async ghostCashUsd(userId) {
      const [{ data: profile, error: pe }, { data: fills, error: fe }] = await Promise.all([
        db.from("profiles").select("ghost_starting_usd").eq("user_id", userId).maybeSingle(),
        db.from("tape").select("payload").eq("user_id", userId).eq("simulated", true).eq("kind", "fill"),
      ]);
      if (pe) throw fail("read profile", pe);
      if (fe) throw fail("read ghost fills", fe);
      const starting = Number(profile?.ghost_starting_usd ?? 100);
      return cashAfterFills(starting, (fills ?? []).map((f) => f.payload as FillPayload));
    },
  };
}
