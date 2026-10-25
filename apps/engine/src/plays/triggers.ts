import type { Cartridge, Trigger } from "@baseland/play-schema";

// Deterministic trigger evaluation: no AI, no I/O. `progress` (0..1) drives
// the Live Activity's bar and ring.

export interface TriggerInput {
  /** Price when the window opened; the reference for pct_move and progress. */
  anchorPrice: number | null;
  price: number | null;
  now: number;
  windowStart: number;
}

export interface TriggerResult {
  fired: boolean;
  progress: number;
}

const clamp = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

export function evaluateTrigger(t: Trigger, i: TriggerInput): TriggerResult {
  switch (t.kind) {
    case "time": {
      const fireAt = i.windowStart + t.afterMin * 60_000;
      const fired = i.now >= fireAt;
      return { fired, progress: fired ? 1 : clamp((i.now - i.windowStart) / (fireAt - i.windowStart)) };
    }
    case "price_cross": {
      if (i.price === null) return { fired: false, progress: 0 };
      const fired = t.direction === "above" ? i.price >= t.price : i.price <= t.price;
      if (fired) return { fired, progress: 1 };
      const anchor = i.anchorPrice ?? i.price;
      const distance = t.price - anchor;
      return { fired, progress: distance === 0 ? 0 : clamp((i.price - anchor) / distance) };
    }
    case "pct_move": {
      if (i.price === null || i.anchorPrice === null || i.anchorPrice <= 0) return { fired: false, progress: 0 };
      const change = ((i.price - i.anchorPrice) / i.anchorPrice) * 100;
      const toward = t.direction === "up" ? change : t.direction === "down" ? -change : Math.abs(change);
      return { fired: toward >= t.pct, progress: clamp(toward / t.pct) };
    }
  }
}

export type ExitReason = "take_profit" | "stop_loss";

export interface ExitResult {
  fired: ExitReason | null;
  /** Progress toward take-profit (0 when only a stop is set). */
  progress: number;
}

/** Exits after an entry BUY filled at `entryPrice`. */
export function evaluateExit(exit: NonNullable<Cartridge["exit"]>, entryPrice: number, price: number): ExitResult {
  const changePct = ((price - entryPrice) / entryPrice) * 100;
  if (exit.takeProfitPct !== undefined && changePct >= exit.takeProfitPct) return { fired: "take_profit", progress: 1 };
  if (exit.stopLossPct !== undefined && changePct <= -exit.stopLossPct) return { fired: "stop_loss", progress: 0 };
  return { fired: null, progress: exit.takeProfitPct ? clamp(changePct / exit.takeProfitPct) : 0 };
}

export function exitPrices(exit: NonNullable<Cartridge["exit"]>, entryPrice: number) {
  return {
    takeProfit: exit.takeProfitPct !== undefined ? entryPrice * (1 + exit.takeProfitPct / 100) : undefined,
    stopLoss: exit.stopLossPct !== undefined ? entryPrice * (1 - exit.stopLossPct / 100) : undefined,
  };
}
