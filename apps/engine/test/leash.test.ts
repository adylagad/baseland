import { describe, expect, it } from "vitest";
import { checkOrder } from "../src/plays/leash.js";

const leash = { maxOrderUsd: 5, maxPlayUsd: 8, maxEvidenceUsdc: 0.1, allowedProducts: ["ETH-USDC"] };
const ctx = { playSpentUsd: 0, playPositionBase: 0, hardMaxOrderUsd: Infinity };
const buy = (quoteUsd: number, product = "ETH-USDC") =>
  ({ purpose: "entry", side: "BUY", product, quoteUsd, estUsd: quoteUsd }) as const;

describe("Leash", () => {
  it("allows an order inside every limit", () => {
    expect(checkOrder(buy(5), leash, ctx)).toEqual({ ok: true });
  });
  it("enforces the per-order limit", () => {
    expect(checkOrder(buy(5.01), leash, ctx)).toEqual({ ok: false, reason: "$5.01 is over the $5.00 order limit" });
  });
  it("enforces the per-Play total", () => {
    expect(checkOrder(buy(4), leash, { ...ctx, playSpentUsd: 5 })).toEqual({
      ok: false,
      reason: "would bring this Play to $9.00, over its $8.00 limit",
    });
  });
  it("enforces the engine's live ceiling", () => {
    expect(checkOrder(buy(5), { ...leash, maxOrderUsd: 50, maxPlayUsd: 50 }, { ...ctx, hardMaxOrderUsd: 3 }).ok).toBe(false);
  });
  it("enforces allowed products and available cash", () => {
    expect(checkOrder(buy(2, "BTC-USDC"), leash, ctx)).toEqual({ ok: false, reason: "BTC-USDC is not on this Play's allowed list" });
    expect(checkOrder(buy(3), leash, { ...ctx, availableUsd: 2 })).toEqual({ ok: false, reason: "only $2.00 available" });
  });
  it("lets exits sell only what the Play holds", () => {
    const exit = (baseSize: number) => ({ purpose: "exit", side: "SELL", product: "ETH-USDC", baseSize, estUsd: 1 }) as const;
    expect(checkOrder(exit(0.001), leash, { ...ctx, playPositionBase: 0.001 })).toEqual({ ok: true });
    expect(checkOrder(exit(0.002), leash, { ...ctx, playPositionBase: 0.001 }).ok).toBe(false);
    expect(checkOrder({ ...exit(0.001), side: "BUY" }, leash, { ...ctx, playPositionBase: 1 }).ok).toBe(false);
  });
});
