import { describe, expect, it, vi } from "vitest";
import { CoinbaseTickerFeed, ManualFeed, normalizeProduct, parseTickerMessage } from "../src/market/feed.js";

describe("product normalization (docs/code-traps.md: USDC ticks arrive as USD)", () => {
  it("maps -USDC to -USD and leaves others", () => {
    expect(normalizeProduct("ETH-USDC")).toBe("ETH-USD");
    expect(normalizeProduct("eth-usd")).toBe("ETH-USD");
    expect(normalizeProduct("NVDA-USD")).toBe("NVDA-USD");
  });

  it("delivers USD ticks to a USDC subscriber, labelled as asked", () => {
    const feed = new ManualFeed();
    const got: string[] = [];
    feed.subscribe("ETH-USDC", (t) => got.push(`${t.productId}@${t.price}`));
    feed.push("ETH-USD", 2400);
    expect(got).toEqual(["ETH-USDC@2400"]);
    expect(feed.last("ETH-USDC")?.price).toBe(2400);
  });

  it("unsubscribe stops delivery", () => {
    const feed = new ManualFeed();
    const fn = vi.fn();
    const unsub = feed.subscribe("BTC-USD", fn);
    unsub();
    feed.push("BTC-USD", 1);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("ticker message parsing", () => {
  it("reads snapshot and update events (shape seen live on 2026-10-24)", () => {
    const msg = JSON.stringify({
      channel: "ticker",
      timestamp: "2026-10-25T01:52:24.540Z",
      events: [{ type: "snapshot", tickers: [{ type: "ticker", product_id: "ETH-USD", price: "2358.76" }] }],
    });
    expect(parseTickerMessage(msg)).toEqual([{ productId: "ETH-USD", price: 2358.76, at: Date.parse("2026-10-25T01:52:24.540Z") }]);
  });
  it("ignores other channels and junk", () => {
    expect(parseTickerMessage(JSON.stringify({ channel: "subscriptions", events: [] }))).toEqual([]);
    expect(parseTickerMessage("not json")).toEqual([]);
    expect(parseTickerMessage(JSON.stringify({ channel: "ticker", events: [{ tickers: [{ product_id: "X-USD", price: "nope" }] }] }))).toEqual([]);
  });
});

describe("CoinbaseTickerFeed", () => {
  class FakeWS {
    static OPEN = 1;
    static instances: FakeWS[] = [];
    readyState = 0;
    sent: unknown[] = [];
    onopen?: () => void;
    onmessage?: (e: { data: string }) => void;
    onclose?: () => void;
    onerror?: () => void;
    constructor(readonly url: string) {
      FakeWS.instances.push(this);
    }
    send(s: string) {
      this.sent.push(JSON.parse(s));
    }
    close() {
      this.onclose?.();
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
  }

  it("connects lazily, subscribes heartbeats + normalized tickers on open, and routes ticks", () => {
    FakeWS.instances = [];
    const feed = new CoinbaseTickerFeed({ WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    const got: number[] = [];
    feed.subscribe("ETH-USDC", (t) => got.push(t.price));
    const ws = FakeWS.instances[0]!;
    ws.open();
    expect(ws.sent).toEqual([
      { type: "subscribe", channel: "heartbeats" },
      { type: "subscribe", product_ids: ["ETH-USD"], channel: "ticker" },
    ]);
    ws.onmessage!({ data: JSON.stringify({ channel: "ticker", events: [{ tickers: [{ product_id: "ETH-USD", price: "2401" }] }] }) });
    expect(got).toEqual([2401]);
    feed.close();
  });
});
