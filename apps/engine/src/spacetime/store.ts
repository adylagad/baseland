import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isTerminal } from "@baseland/play-schema";
import { DbConnection, tables } from "./bindings/index.js";
import { cashAfterFills, ConflictError, fillsOf, type NewPlay, type PlayPatch, type PlayRecord, type PlayStore, type TapeEvent, type TapeRow } from "../plays/store.js";
import type { FillPayload } from "../plays/ledger.js";

export type LiveChange = { type: "play"; play: PlayRecord } | { type: "tape"; tape: TapeRow };
export interface LivePlayStore extends PlayStore {
  subscribe(listener: (change: LiveChange) => void): () => void;
  close(): void;
}

type SpacetimeConfig = { host: string; database: string; token: string };

/**
 * SpacetimeDB is the authoritative Play and Tape database. A single engine
 * connection subscribes to private tables as the module owner. Reducers do
 * compare-and-set and idempotency checks in Spacetime transactions; callbacks
 * feed the iPhone's authenticated event stream.
 */
export async function spacetimePlayStore(config: SpacetimeConfig, profiles: SupabaseClient): Promise<LivePlayStore> {
  const listeners = new Set<(change: LiveChange) => void>();
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let initial = true;
  const emit = (change: LiveChange) => { if (!initial) for (const listener of listeners) listener(change); };
  const conn = DbConnection.builder()
    .withUri(config.host)
    .withDatabaseName(config.database)
    .withToken(config.token)
    .withAutomaticReconnect()
    .onConnect((ctx) => {
      ctx.subscriptionBuilder()
        .onApplied(() => { initial = false; readyResolve(); })
        .onError(() => readyReject(new Error("Spacetime subscription failed")))
        .subscribe([tables.play, tables.tape]);
    })
    .onConnectError((_ctx, error) => readyReject(error))
    .build();

  conn.db.play.onInsert((_ctx, row) => emit({ type: "play", play: JSON.parse(row.dataJson) as PlayRecord }));
  conn.db.play.onUpdate((_ctx, _old, row) => emit({ type: "play", play: JSON.parse(row.dataJson) as PlayRecord }));
  conn.db.tape.onInsert((_ctx, row) => emit({ type: "tape", tape: { ...JSON.parse(row.dataJson) as TapeEvent, id: Number(row.id), at: row.at } }));
  await ready;

  const fromPlay = (id: string) => {
    const row = conn.db.play.id.find(id);
    return row ? JSON.parse(row.dataJson) as PlayRecord : null;
  };
  const tapeRows = () => Array.from(conn.db.tape.iter(), (row) => ({
    ...JSON.parse(row.dataJson) as TapeEvent,
    id: Number(row.id),
    at: row.at,
  } satisfies TapeRow));
  const now = () => new Date().toISOString();
  const conflict = (error: unknown) => {
    const message = String(error);
    if (/changed underneath|Duplicate idempotency|already exists/i.test(message)) return new ConflictError(message);
    return error;
  };

  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    close() { conn.disconnect(); listeners.clear(); },
    async insert(p: NewPlay) {
      const at = now();
      const rec: PlayRecord = { ...structuredClone(p), id: randomUUID(), state: "armed", stateReason: null,
        pending: null, createdAt: at, updatedAt: at };
      try { await conn.reducers.insertPlay({ dataJson: JSON.stringify(rec) }); }
      catch (error) { throw conflict(error); }
      return fromPlay(rec.id) ?? rec;
    },
    async get(id) { return fromPlay(id); },
    async listForUser(userId) {
      return Array.from(conn.db.play.iter())
        .filter((row) => row.userId === userId)
        .map((row) => JSON.parse(row.dataJson) as PlayRecord)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
    },
    async listActive() {
      return Array.from(conn.db.play.iter())
        .filter((row) => !isTerminal(row.state as PlayRecord["state"]))
        .map((row) => JSON.parse(row.dataJson) as PlayRecord);
    },
    async update(id, patch: PlayPatch, expectState) {
      const prior = fromPlay(id);
      if (!prior) throw new ConflictError(`no play ${id}`);
      const next = { ...prior, ...structuredClone(patch), updatedAt: now() };
      try { await conn.reducers.updatePlay({ id, expectedState: expectState ?? prior.state, dataJson: JSON.stringify(next) }); }
      catch (error) { throw conflict(error); }
      return fromPlay(id) ?? next;
    },
    async appendTape(e: TapeEvent) {
      const at = now();
      try {
        await conn.reducers.appendTape({ playId: e.playId, userId: e.userId, kind: e.kind,
          simulated: e.simulated, at, dataJson: JSON.stringify(e), idempotencyKey: e.idempotencyKey ?? "" });
      } catch (error) { throw conflict(error); }
    },
    async tape(playId) { return tapeRows().filter((row) => row.playId === playId).sort((a, b) => a.id - b.id); },
    async ghostCashUsd(userId) {
      const { data, error } = await profiles.from("profiles").select("ghost_starting_usd").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      const fills = fillsOf(tapeRows().filter((row) => row.userId === userId && row.simulated));
      return cashAfterFills(Number(data?.ghost_starting_usd ?? 100), fills);
    },
    async fillsForUser(userId, simulated): Promise<FillPayload[]> {
      return fillsOf(tapeRows().filter((row) => row.userId === userId && row.simulated === simulated));
    },
  };
}
