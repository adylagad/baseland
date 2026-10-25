import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../src/plays/store.js";
import { spacetimePlayStore } from "../src/spacetime/store.js";

const host = process.env.SPACETIMEDB_HOST;
const database = process.env.SPACETIMEDB_DB_NAME;
const token = process.env.SPACETIMEDB_TOKEN;

describe.skipIf(!host || !database || !token)("SpacetimeDB Play transactions", () => {
  it("publishes Play and Tape changes, guards stale updates, and deduplicates money actions", async () => {
    const store = await spacetimePlayStore({ host: host!, database: database!, token: token! }, {} as SupabaseClient);
    try {
      const userId = randomUUID();
      const changes: string[] = [];
      const stop = store.subscribe((change) => changes.push(change.type));
      const play = await store.insert({
        userId, title: "Ghost integration", sentence: [], spec: {} as never, mode: "ghost",
        status: { phase: "entry", symbol: "ETH", headline: "Armed.", progress: 0 },
        windowStart: new Date().toISOString(), windowEnd: new Date(Date.now() + 60_000).toISOString(),
      });
      expect((await store.get(play.id))?.state).toBe("armed");
      const watching = await store.update(play.id, { state: "watching" }, "armed");
      expect(watching.state).toBe("watching");
      await expect(store.update(play.id, { state: "done" }, "armed")).rejects.toBeInstanceOf(ConflictError);
      const event = { playId: play.id, userId, kind: "note" as const, simulated: true,
        payload: { message: "test" }, idempotencyKey: randomUUID() };
      await store.appendTape(event);
      await expect(store.appendTape(event)).rejects.toBeInstanceOf(ConflictError);
      expect((await store.tape(play.id))).toHaveLength(1);
      expect(changes).toContain("play");
      expect(changes).toContain("tape");
      await store.update(play.id, { state: "done" }, "watching");
      expect((await store.listActive()).some((p) => p.id === play.id)).toBe(false);

      // A migration retry must preserve a historical Play and import each
      // source Tape row only once, even though Spacetime assigns new IDs.
      const historical = { ...play, id: randomUUID(), state: "done" as const };
      const call = async (name: string, args: unknown[]) => {
        const url = new URL(`/v1/database/${database}/call/${name}`, host);
        const response = await fetch(url, { method: "POST", headers: {
          Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        }, body: JSON.stringify(args) });
        expect(response.status).toBe(200);
      };
      await call("import_play", [JSON.stringify(historical)]);
      await call("import_play", [JSON.stringify(historical)]);
      expect((await store.get(historical.id))?.state).toBe("done");
      const sourceId = randomUUID();
      const imported = { ...event, playId: historical.id, idempotencyKey: randomUUID() };
      const args = [sourceId, historical.id, userId, "note", true, new Date().toISOString(), JSON.stringify(imported), imported.idempotencyKey];
      await call("import_tape", args);
      await call("import_tape", args);
      expect(await store.tape(historical.id)).toHaveLength(1);
      stop();
    } finally {
      store.close();
    }
  });
});
