import { describe, expect, it } from "vitest";
import { evaluateExit, evaluateTrigger, exitPrices } from "../src/plays/triggers.js";

const base = { now: 0, windowStart: 0 };

describe("price_cross", () => {
  const above = { kind: "price_cross", product: "ETH-USDC", direction: "above", price: 2400 } as const;
  it("tracks progress from the anchor and fires at the level", () => {
    expect(evaluateTrigger(above, { ...base, anchorPrice: 2300, price: 2350 })).toEqual({ fired: false, progress: 0.5 });
    expect(evaluateTrigger(above, { ...base, anchorPrice: 2300, price: 2400 })).toEqual({ fired: true, progress: 1 });
    expect(evaluateTrigger(above, { ...base, anchorPrice: 2300, price: 2250 }).progress).toBe(0);
  });
  it("below fires at or under the level", () => {
    const below = { ...above, direction: "below", price: 2200 } as const;
    expect(evaluateTrigger(below, { ...base, anchorPrice: 2300, price: 2250 })).toEqual({ fired: false, progress: 0.5 });
    expect(evaluateTrigger(below, { ...base, anchorPrice: 2300, price: 2199 }).fired).toBe(true);
  });
  it("does nothing without a price", () => {
    expect(evaluateTrigger(above, { ...base, anchorPrice: 2300, price: null })).toEqual({ fired: false, progress: 0 });
  });
});

describe("pct_move", () => {
  const t = (direction: "up" | "down" | "either") => ({ kind: "pct_move", product: "BTC-USDC", direction, pct: 3 }) as const;
  it("measures from the anchor", () => {
    expect(evaluateTrigger(t("down"), { ...base, anchorPrice: 100, price: 98.5 })).toEqual({ fired: false, progress: 0.5 });
    expect(evaluateTrigger(t("down"), { ...base, anchorPrice: 100, price: 97 }).fired).toBe(true);
    expect(evaluateTrigger(t("up"), { ...base, anchorPrice: 100, price: 97 }).fired).toBe(false);
    expect(evaluateTrigger(t("either"), { ...base, anchorPrice: 100, price: 97 }).fired).toBe(true);
  });
  it("needs an anchor", () => {
    expect(evaluateTrigger(t("up"), { ...base, anchorPrice: null, price: 110 }).fired).toBe(false);
  });
});

describe("time", () => {
  it("fires after the offset; 0 fires immediately", () => {
    const t = { kind: "time", afterMin: 10 } as const;
    expect(evaluateTrigger(t, { anchorPrice: null, price: null, windowStart: 0, now: 5 * 60_000 })).toEqual({ fired: false, progress: 0.5 });
    expect(evaluateTrigger(t, { anchorPrice: null, price: null, windowStart: 0, now: 10 * 60_000 }).fired).toBe(true);
    expect(evaluateTrigger({ kind: "time", afterMin: 0 }, { anchorPrice: null, price: null, windowStart: 0, now: 0 }).fired).toBe(true);
  });
});

describe("exits", () => {
  const exit = { takeProfitPct: 4, stopLossPct: 2 };
  it("take-profit, stop-loss, progress toward take-profit", () => {
    expect(evaluateExit(exit, 100, 104).fired).toBe("take_profit");
    expect(evaluateExit(exit, 100, 98).fired).toBe("stop_loss");
    expect(evaluateExit(exit, 100, 102)).toEqual({ fired: null, progress: 0.5 });
  });
  it("computes exit prices", () => {
    expect(exitPrices(exit, 2000)).toEqual({ takeProfit: 2080, stopLoss: 1960 });
    expect(exitPrices({ stopLossPct: 6 }, 100)).toEqual({ takeProfit: undefined, stopLoss: 94 });
  });
});
