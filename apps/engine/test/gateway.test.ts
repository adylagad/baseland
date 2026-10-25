import { describe, expect, it } from "vitest";
import { CoinbaseCliError, type CliRunner } from "../src/coinbase/cli.js";
import type { MarketData } from "../src/market/public.js";
import { CoinbaseGateway, GhostGateway, mapStatus } from "../src/trading/gateway.js";

const market: MarketData = { quote: async (productId) => ({ productId, price: 2000, change24hPct: null, at: "" }) };

describe("GhostGateway", () => {
  it("fills a $3 BUY at the current price with the fee inside the spend", async () => {
    const g = new GhostGateway(market);
    const { orderId } = await g.place({ side: "BUY", product: "ETH-USDC", quoteSize: "3.00", clientOrderId: "c1" });
    const s = await g.status(orderId);
    expect(s.state).toBe("filled");
    expect(s.avgPrice).toBe(2000);
    expect(s.feeUsd).toBeCloseTo(0.027, 6);
    expect(s.filledBase).toBeCloseTo((3 - 0.027) / 2000, 12);
  });

  it("is idempotent by clientOrderId", async () => {
    const g = new GhostGateway(market);
    const a = await g.place({ side: "BUY", product: "ETH-USDC", quoteSize: "3.00", clientOrderId: "same" });
    const b = await g.place({ side: "BUY", product: "ETH-USDC", quoteSize: "3.00", clientOrderId: "same" });
    expect(a).toEqual(b);
  });

  it("previews with the fee", async () => {
    expect(await new GhostGateway(market).preview({ side: "SELL", product: "ETH-USDC", baseSize: "0.001", clientOrderId: "x" })).toEqual({
      estAvgPrice: 2000,
      estFeeUsd: 0.018,
      estTotalUsd: 1.982,
      warning: null,
    });
  });
});

describe("CoinbaseGateway (fake CLI; no network, no money)", () => {
  const key = { keyId: "k", secret: "s" };
  const PORTFOLIO = "abd3baff-2dec-4fe0-93e0-6e540c8cca49";

  function cli(responses: Record<string, unknown | Error>) {
    const calls: string[][] = [];
    const run: CliRunner = async (args) => {
      calls.push(args);
      const r = responses[`${args[0]} ${args[1]}`];
      if (r instanceof Error) throw r;
      return r;
    };
    return { run, calls };
  }

  it("previews and places a market BUY in the key's portfolio with the idempotency key and attached exits", async () => {
    const { run, calls } = cli({
      "orders preview": { order_total: "3", commission_total: "0.027", est_average_filled_price: "2000.5" },
      "orders create": { success: true, success_response: { order_id: "o-1" } },
    });
    const g = new CoinbaseGateway(run, key, PORTFOLIO);
    const req = {
      side: "BUY" as const,
      product: "ETH-USDC",
      quoteSize: "3.00",
      clientOrderId: "bl-play-entry",
      attachedTakeProfitPrice: "2080.52",
      attachedStopLossPrice: "1960.49",
    };
    expect(await g.preview(req)).toEqual({ estAvgPrice: 2000.5, estFeeUsd: 0.027, estTotalUsd: 3, warning: null });
    expect(await g.place(req)).toEqual({ orderId: "o-1" });

    expect(calls[0]).toEqual([
      "orders", "preview", "product_id=ETH-USDC", "side=BUY", "type=market", `portfolio_id=${PORTFOLIO}`,
      "quote_size=3.00", "attached_take_profit_price=2080.52", "attached_stop_loss_price=1960.49",
    ]);
    // Only create carries the idempotency key.
    expect(calls[1]).toContain("client_order_id=bl-play-entry");
    expect(calls[0]!.some((a) => a.startsWith("client_order_id"))).toBe(false);
  });

  it("returns null when Coinbase can't preview (live Plays then refuse to trade)", async () => {
    const { run } = cli({ "orders preview": new CoinbaseCliError("preview unavailable (HTTP 400)", 400, null) });
    expect(await new CoinbaseGateway(run, key, PORTFOLIO).preview({ side: "BUY", product: "AAPL-USD", quoteSize: "5.00", clientOrderId: "x" })).toBeNull();
    const failed = cli({ "orders preview": { preview_failure_reason: "PREVIEW_INSUFFICIENT_FUND" } });
    expect(await new CoinbaseGateway(failed.run, key, PORTFOLIO).preview({ side: "BUY", product: "ETH-USDC", quoteSize: "5.00", clientOrderId: "x" })).toBeNull();
  });

  it("refuses an order Coinbase didn't accept", async () => {
    const { run } = cli({ "orders create": { success: false, error_response: { message: "INSUFFICIENT_FUND" } } });
    await expect(new CoinbaseGateway(run, key, PORTFOLIO).place({ side: "BUY", product: "ETH-USDC", quoteSize: "3.00", clientOrderId: "x" })).rejects.toThrow(
      "Coinbase did not accept the order: INSUFFICIENT_FUND",
    );
  });

  it("reads order status, wrapped or not", async () => {
    const order = { order_id: "o-1", status: "FILLED", filled_size: "0.0014865", average_filled_price: "2000", total_fees: "0.027" };
    for (const body of [order, { order }]) {
      const { run } = cli({ "orders get": body });
      expect(await new CoinbaseGateway(run, key, PORTFOLIO).status("o-1")).toEqual({
        orderId: "o-1", state: "filled", filledBase: 0.0014865, avgPrice: 2000, feeUsd: 0.027,
      });
    }
  });

  it("maps Coinbase statuses", () => {
    expect(["FILLED", "OPEN", "PENDING", "CANCELLED", "EXPIRED", "FAILED", "QUEUED"].map(mapStatus)).toEqual([
      "filled", "open", "open", "cancelled", "cancelled", "failed", "open",
    ]);
  });
});
