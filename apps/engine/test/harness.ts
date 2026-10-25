import { ManualFeed } from "../src/market/feed.js";
import type { MarketData } from "../src/market/public.js";
import { RuleBrain, type Brain } from "../src/plays/brain.js";
import { PlayRuntime, type RuntimeDeps } from "../src/plays/runtime.js";
import { memoryPlayStore } from "../src/plays/store.js";
import { GhostGateway, type TradingGateway } from "../src/trading/gateway.js";

/**
 * A runtime with a hand-driven clock and price feed. Ghost fills use the
 * feed's latest price, so a test fully controls what everything costs.
 */
export function harness(opts: {
  brain?: Brain;
  live?: TradingGateway;
  liveTradingEnabled?: boolean;
  hasLiveAccess?: boolean;
  ghostStartingUsd?: number;
} = {}) {
  let now = Date.parse("2026-10-25T18:00:00Z");
  const clock = {
    now: () => now,
    advance: (ms: number) => (now += ms),
    set: (iso: string) => (now = Date.parse(iso)),
  };
  const feed = new ManualFeed();
  const market: MarketData = {
    async quote(productId) {
      const t = feed.last(productId);
      if (!t) throw new Error(`no test price for ${productId}`);
      return { productId, price: t.price, change24hPct: null, at: new Date(now).toISOString() };
    },
  };
  const store = memoryPlayStore({ ghostStartingUsd: opts.ghostStartingUsd ?? 100 });
  const ghost = new GhostGateway(market);
  const deps: RuntimeDeps = {
    store,
    feed,
    market,
    brain: opts.brain ?? new RuleBrain(),
    limits: { liveTradingEnabled: opts.liveTradingEnabled ?? false, hardMaxOrderUsd: 10 },
    hasLiveAccess: async () => opts.hasLiveAccess ?? false,
    gatewayFor: async (p) => (p.mode === "ghost" ? ghost : (opts.live ?? ghost)),
    clock: clock.now,
    statusEveryMs: 0,
    pollMs: 1,
    pollTimeoutMs: 50,
    sleep: async () => void clock.advance(10),
  };
  const runtime = new PlayRuntime(deps);

  /** Pushes a price and waits for the runtime to finish reacting to it. */
  const price = async (productId: string, p: number) => {
    feed.push(productId, p, now);
    await settle();
  };
  const tick = async (ms = 0) => {
    clock.advance(ms);
    await runtime.tick();
    await settle();
  };
  const kinds = async (playId: string) => (await store.tape(playId)).map((t) => t.kind);
  const states = async (playId: string) =>
    (await store.tape(playId)).filter((t) => t.kind === "state").map((t) => t.payload.to);

  return { runtime, store, feed, clock, price, tick, kinds, states, ghost, deps };
}

/** Lets queued per-Play work (price ticks run through a lock) finish. */
export async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}
