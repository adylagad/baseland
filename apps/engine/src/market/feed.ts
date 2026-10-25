// Live prices for watchers. Three implementations behind one interface:
// - CoinbaseTickerFeed: the public ticker WebSocket (no key needed);
// - ReplayFeed: recorded prices played back, for demos on bad Wi-Fi;
// - ManualFeed: prices pushed by hand, for tests.

export interface Tick {
  productId: string;
  price: number;
  at: number;
}

export type TickListener = (tick: Tick) => void;

export interface PriceFeed {
  /** Calls `onTick` for every price of `productId`. Returns an unsubscribe. */
  subscribe(productId: string, onTick: TickListener): () => void;
  /** The latest price seen for `productId`, if any. */
  last(productId: string): Tick | undefined;
  close(): void;
}

/**
 * Coinbase streams USDC books under their USD id (ETH-USDC ticks arrive as
 * ETH-USD; see docs/code-traps.md). Listeners are keyed by the normalized id,
 * and ticks are re-labelled with the id the caller subscribed with.
 */
export const normalizeProduct = (id: string) => id.toUpperCase().replace(/-USDC$/, "-USD");

/** Shared listener bookkeeping for every feed. */
class Listeners {
  private byKey = new Map<string, Map<TickListener, string>>();
  private latest = new Map<string, Tick>();

  add(productId: string, fn: TickListener): { key: string; first: boolean; remove: () => boolean } {
    const key = normalizeProduct(productId);
    let set = this.byKey.get(key);
    const first = !set || set.size === 0;
    if (!set) this.byKey.set(key, (set = new Map()));
    set.set(fn, productId);
    return {
      key,
      first,
      remove: () => {
        set!.delete(fn);
        return set!.size === 0;
      },
    };
  }

  emit(rawProductId: string, price: number, at: number) {
    const key = normalizeProduct(rawProductId);
    this.latest.set(key, { productId: key, price, at });
    for (const [fn, asked] of this.byKey.get(key) ?? []) fn({ productId: asked, price, at });
  }

  last(productId: string): Tick | undefined {
    const t = this.latest.get(normalizeProduct(productId));
    return t && { ...t, productId };
  }

  keys() {
    return [...this.byKey].filter(([, s]) => s.size > 0).map(([k]) => k);
  }
}

export class ManualFeed implements PriceFeed {
  private l = new Listeners();
  subscribe(productId: string, onTick: TickListener) {
    const h = this.l.add(productId, onTick);
    return () => void h.remove();
  }
  push(productId: string, price: number, at = Date.now()) {
    this.l.emit(productId, price, at);
  }
  last(productId: string) {
    return this.l.last(productId);
  }
  close() {}
}

/** Plays a recorded series in a loop at `speed`× real time. */
export class ReplayFeed implements PriceFeed {
  private l = new Listeners();
  private timer: ReturnType<typeof setInterval> | null = null;
  private i = 0;

  constructor(
    private readonly samples: { productId: string; price: number }[],
    private readonly intervalMs = 1000,
  ) {}

  subscribe(productId: string, onTick: TickListener) {
    const h = this.l.add(productId, onTick);
    if (!this.timer && this.samples.length) {
      this.timer = setInterval(() => {
        const s = this.samples[this.i++ % this.samples.length]!;
        this.l.emit(s.productId, s.price, Date.now());
      }, this.intervalMs);
    }
    return () => void h.remove();
  }
  last(productId: string) {
    return this.l.last(productId);
  }
  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

const WS_URL = "wss://advanced-trade-ws.coinbase.com";

/** Parses one ticker-channel message into price updates. Exported for tests. */
export function parseTickerMessage(raw: string): { productId: string; price: number; at: number }[] {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return [];
  }
  const m = msg as { channel?: string; timestamp?: string; events?: { tickers?: { product_id?: string; price?: string }[] }[] };
  if (m.channel !== "ticker" || !Array.isArray(m.events)) return [];
  const at = m.timestamp ? Date.parse(m.timestamp) : Date.now();
  const out: { productId: string; price: number; at: number }[] = [];
  for (const e of m.events) {
    for (const t of e.tickers ?? []) {
      const price = Number(t.price);
      if (t.product_id && Number.isFinite(price) && price > 0) out.push({ productId: t.product_id, price, at });
    }
  }
  return out;
}

export interface TickerFeedOptions {
  url?: string;
  log?: { warn(obj: object, msg: string): void };
  /** Injected for tests. */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * The public ticker WebSocket, with reconnect (exponential backoff, max 30s)
 * and resubscription. It also subscribes to `heartbeats`, which keeps
 * Coinbase from closing a quiet connection.
 */
export class CoinbaseTickerFeed implements PriceFeed {
  private l = new Listeners();
  private ws: WebSocket | null = null;
  private retry = 0;
  private closed = false;
  private readonly url: string;
  private readonly WS: typeof WebSocket;

  constructor(private readonly opts: TickerFeedOptions = {}) {
    this.url = opts.url ?? WS_URL;
    this.WS = opts.WebSocketImpl ?? WebSocket;
  }

  subscribe(productId: string, onTick: TickListener) {
    const h = this.l.add(productId, onTick);
    if (h.first) this.send("subscribe", [h.key]);
    return () => {
      if (h.remove()) this.send("unsubscribe", [h.key]);
    };
  }

  last(productId: string) {
    return this.l.last(productId);
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  private send(type: "subscribe" | "unsubscribe", productIds: string[]) {
    if (!this.ws) return this.connect();
    if (this.ws.readyState !== this.WS.OPEN) return; // onopen subscribes everything
    this.ws.send(JSON.stringify({ type, product_ids: productIds, channel: "ticker" }));
  }

  private connect() {
    if (this.closed || this.ws) return;
    const ws = new this.WS(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ type: "subscribe", channel: "heartbeats" }));
      const keys = this.l.keys();
      if (keys.length) ws.send(JSON.stringify({ type: "subscribe", product_ids: keys, channel: "ticker" }));
    };
    ws.onmessage = (e) => {
      for (const t of parseTickerMessage(String(e.data))) this.l.emit(t.productId, t.price, t.at);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closed) return;
      const delay = Math.min(30_000, 500 * 2 ** this.retry++);
      this.opts.log?.warn({ delay }, "ticker feed closed; reconnecting");
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }
}
