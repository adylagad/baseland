import { describe, expect, it } from "vitest";
import { fakeCoinbase, testServer } from "./helpers.js";
import type { LiveChange } from "../src/spacetime/store.js";

describe("authenticated Spacetime event relay", () => {
  it("streams only the signed-in user's changes", async () => {
    let listener: ((change: LiveChange) => void) | undefined;
    const events = { subscribe(fn: (change: LiveChange) => void) { listener = fn; return () => { listener = undefined; }; } };
    const { app, h } = testServer(fakeCoinbase({ portfolios: [], accessible: [] }), undefined, undefined, undefined, events);
    const base = await app.listen({ host: "127.0.0.1", port: 0 });
    const abort = new AbortController();
    try {
      const unauthorized = await fetch(`${base}/v1/events`);
      expect(unauthorized.status).toBe(401);
      const response = await fetch(`${base}/v1/events`, { headers: { Authorization: "Bearer token-alice" }, signal: abort.signal });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      await reader.read(); // initial SSE comment
      const bob = await h.store.insert({ userId: "bob", title: "Private", sentence: [], spec: {} as never,
        mode: "ghost", status: { phase: "entry", symbol: "ETH", headline: "Armed", progress: 0 },
        windowStart: new Date().toISOString(), windowEnd: new Date(Date.now() + 60_000).toISOString() });
      const alice = { ...bob, id: "alice-play", userId: "alice" };
      listener?.({ type: "play", play: bob });
      listener?.({ type: "play", play: alice });
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain("alice-play");
      expect(text).not.toContain(bob.id);
    } finally {
      abort.abort();
      await app.close();
    }
  });
});
