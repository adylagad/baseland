// A Play's money, derived from its Tape's fills and never stored (AGENTS.md:
// totals are derived). Fill payloads are written by the runtime in exactly
// this shape.

export interface FillPayload {
  side: "BUY" | "SELL";
  product: string;
  purpose: "entry" | "exit";
  orderId: string;
  baseSize: number;
  avgPrice: number;
  /** Gross notional: baseSize × avgPrice. */
  valueUsd: number;
  feeUsd: number;
}

export interface Ledger {
  /** USD that left the account on buys, fees included. */
  spentUsd: number;
  /** USD that came back on sells, net of fees. */
  receivedUsd: number;
  feesUsd: number;
  positionBase: number;
  /** Average entry price of the open position, if any. */
  entryPrice: number | null;
  realizedPnlUsd: number;
}

export function ledgerOf(fills: FillPayload[]): Ledger {
  let spentUsd = 0;
  let receivedUsd = 0;
  let feesUsd = 0;
  let boughtBase = 0;
  let boughtValue = 0;
  let soldBase = 0;
  for (const f of fills) {
    feesUsd += f.feeUsd;
    if (f.side === "BUY") {
      spentUsd += f.valueUsd + f.feeUsd;
      boughtBase += f.baseSize;
      boughtValue += f.valueUsd;
    } else {
      receivedUsd += f.valueUsd - f.feeUsd;
      soldBase += f.baseSize;
    }
  }
  const positionBase = round(boughtBase - soldBase, 12);
  const avgEntry = boughtBase > 0 ? boughtValue / boughtBase : null;
  // Realized P&L counts only the sold part of the position, at its share of
  // what was spent buying it (buy fees included).
  const costOfSold = boughtBase > 0 ? spentUsd * Math.min(1, soldBase / boughtBase) : 0;
  const realizedPnlUsd = soldBase > 0 ? round(receivedUsd - costOfSold, 6) : 0;
  return {
    spentUsd: round(spentUsd, 6),
    receivedUsd: round(receivedUsd, 6),
    feesUsd: round(feesUsd, 6),
    positionBase,
    entryPrice: positionBase > 0 ? avgEntry : null,
    realizedPnlUsd,
  };
}

/** Unrealized P&L of the open position at `price`. */
export function unrealizedPnlUsd(l: Ledger, price: number): number {
  if (l.positionBase <= 0 || l.entryPrice === null) return 0;
  return round(l.positionBase * (price - l.entryPrice), 6);
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
