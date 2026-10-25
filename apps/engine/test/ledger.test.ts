import { describe, expect, it } from "vitest";
import { ledgerOf, unrealizedPnlUsd, type FillPayload } from "../src/plays/ledger.js";
import { cashAfterFills } from "../src/plays/store.js";

// $3 market buy at $2,000 with a 0.9% fee inside the spend, as Ghost and
// Coinbase both do it: fee $0.027, notional $2.973, base 0.0014865.
const buy: FillPayload = { side: "BUY", product: "ETH-USDC", purpose: "entry", orderId: "1", baseSize: 0.0014865, avgPrice: 2000, valueUsd: 2.973, feeUsd: 0.027 };
const sell: FillPayload = { side: "SELL", product: "ETH-USDC", purpose: "exit", orderId: "2", baseSize: 0.0014865, avgPrice: 2080, valueUsd: 3.09192, feeUsd: 0.027827 };

describe("ledger", () => {
  it("open position after a buy", () => {
    const l = ledgerOf([buy]);
    expect(l).toMatchObject({ spentUsd: 3, positionBase: 0.0014865, entryPrice: 2000, realizedPnlUsd: 0 });
    expect(unrealizedPnlUsd(l, 2080)).toBeCloseTo(0.11892, 5);
  });

  it("realized P&L after the exit counts both fees", () => {
    const l = ledgerOf([buy, sell]);
    expect(l.positionBase).toBe(0);
    expect(l.entryPrice).toBeNull();
    expect(l.realizedPnlUsd).toBeCloseTo(3.09192 - 0.027827 - 3, 6);
  });

  it("ghost cash follows fills", () => {
    expect(cashAfterFills(100, [buy])).toBe(97);
    expect(cashAfterFills(100, [buy, sell])).toBeCloseTo(100 + 3.064093 - 3, 6);
  });
});
