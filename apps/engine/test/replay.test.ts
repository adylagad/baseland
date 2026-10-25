import { describe, expect, it } from "vitest";
import { Cartridge, examples, type CartridgeInput } from "@baseland/play-schema";
import { granularityFor, replay } from "../src/replay.js";
import { syntheticCandles } from "./helpers.js";

const now = Date.parse("2026-10-25T00:00:00Z");
const cart = (over: Partial<CartridgeInput>) => Cartridge.parse({ ...structuredClone(examples.ethBreakout), ...over });

describe("Replay (synthetic candles: flat 100, climb to 106 at hour 25, slide to 97)", () => {
  it("fires a breakout at its level and takes profit at the exit level, fees included", async () => {
    const r = await replay(
      cart({ window: { lastsMin: 2880 }, trigger: { kind: "price_cross", product: "ETH-USDC", direction: "above", price: 103 }, action: { side: "BUY", product: "ETH-USDC", quoteUsd: 5 }, exit: { takeProfitPct: 2, stopLossPct: 2 } }),
      { days: 2, candles: syntheticCandles, now },
    );
    expect(r).toMatchObject({ simulated: true, fired: true, holding: false, trigger: { price: 103 }, exit: { reason: "take_profit", price: 105.06 } });
    const qty = (5 - 0.045) / 103;
    expect(r.entry!.base).toBeCloseTo(qty, 9);
    expect(r.pnlUsd).toBeCloseTo(qty * 105.06 * (1 - 0.009) - 5, 5);
    expect(r.series.length).toBe(48);
    expect(r.notes[0]).toMatch(/^Simulated/);
  });

  it("reports a Play that never fires", async () => {
    const r = await replay(cart({ window: { lastsMin: 2880 }, trigger: { kind: "price_cross", product: "ETH-USDC", direction: "above", price: 110 } }), { days: 2, candles: syntheticCandles, now });
    expect(r).toMatchObject({ fired: false, pnlUsd: 0, holding: false });
  });

  it("a dip-buy without exits is marked to the last price, still holding", async () => {
    const r = await replay(
      Cartridge.parse({ ...structuredClone(examples.btcDip), window: { lastsMin: 2880 }, trigger: { kind: "pct_move", product: "BTC-USDC", direction: "down", pct: 2 } }),
      { days: 2, candles: syntheticCandles, now },
    );
    expect(r).toMatchObject({ fired: true, holding: true, trigger: { price: 98 } });
    expect(r.pnlUsd).toBeLessThan(0);
  });

  it("refuses what it can't simulate", async () => {
    const sell = cart({ action: { side: "SELL", product: "ETH-USDC", baseSize: "0.001" }, exit: undefined, sentence: [{ kind: "text", text: "sell" }] });
    await expect(replay(sell, { days: 1, candles: syntheticCandles, now })).rejects.toThrow("buying Plays");
  });

  it("picks a granularity under Coinbase's 350-candle cap", () => {
    expect([granularityFor(1), granularityFor(3), granularityFor(7)]).toEqual(["FIVE_MINUTE", "FIFTEEN_MINUTE", "ONE_HOUR"]);
  });
});
