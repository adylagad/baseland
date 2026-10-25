import { z } from "zod";
import { Cartridge, symbolOf } from "@baseland/play-schema";
import { evaluateTrigger, exitPrices } from "./plays/triggers.js";
import { GHOST_TAKER_FEE } from "./trading/gateway.js";

// Replay: run a Play against real past prices, as if it had been armed at
// the start of the range. Always simulated. It assumes the agent acts on the
// first trigger (it doesn't call Claude), fills at the trigger level, and
// exits at the take-profit or stop-loss level. If both are touched in the
// same candle, it assumes the stop hit first (the conservative read).

export interface Candle {
  /** Start, ms epoch. */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type CandleSource = (product: string, startSec: number, endSec: number, granularity: Granularity) => Promise<Candle[]>;
export type Granularity = "FIVE_MINUTE" | "FIFTEEN_MINUTE" | "ONE_HOUR";

export interface ReplayResult {
  simulated: true;
  product: string;
  granularity: Granularity;
  from: string;
  to: string;
  fired: boolean;
  trigger?: { at: string; price: number };
  entry?: { at: string; price: number; base: number; feeUsd: number; spentUsd: number };
  exit?: { at: string; price: number; reason: "take_profit" | "stop_loss" | "window_end"; feeUsd: number };
  /** Realized, or marked to the last close if still holding. */
  pnlUsd: number;
  holding: boolean;
  series: { t: string; close: number }[];
  notes: string[];
}

const SECONDS: Record<Granularity, number> = { FIVE_MINUTE: 300, FIFTEEN_MINUTE: 900, ONE_HOUR: 3600 };

/** Coinbase returns at most 350 candles per call. */
export function granularityFor(days: number): Granularity {
  return days <= 1 ? "FIVE_MINUTE" : days <= 3 ? "FIFTEEN_MINUTE" : "ONE_HOUR";
}

export async function replay(spec: Cartridge, opts: { days: number; candles: CandleSource; now?: number }): Promise<ReplayResult> {
  if (spec.action.side !== "BUY") throw new ReplayError("Replay covers buying Plays for now.");
  const product = spec.trigger.kind === "time" ? spec.action.product : spec.trigger.product;
  if (product !== spec.action.product) throw new ReplayError("Replay needs the trigger and the order on the same asset.");

  const g = granularityFor(opts.days);
  const end = Math.floor((opts.now ?? Date.now()) / 1000);
  const start = end - Math.round(opts.days * 86400);
  const candles = (await opts.candles(product, start, end, g)).sort((a, b) => a.t - b.t);
  if (candles.length < 2) throw new ReplayError(`Not enough price history for ${symbolOf(product)}.`);

  const notes = ["Simulated: assumes the agent acted on the first trigger (no Claude call) and fills at the trigger price, with the 0.9% fee."];
  // Replay watches the whole range shown on the chart, not just the Play's
  // own window from the range start: otherwise a crossing visible on the
  // chart could read as "never triggered" (seen in the first UI test run).
  const windowStart = candles[0]!.t + spec.window.startsInMin * 60_000;
  const windowEnd = candles[candles.length - 1]!.t + SECONDS[g] * 1000;
  const inWindow = candles.filter((c) => c.t >= windowStart && c.t < windowEnd);
  const rangeMin = Math.round((end - start) / 60);
  if (spec.window.lastsMin !== rangeMin) {
    notes.push(`Watched the whole ${opts.days === 1 ? "24 hours" : `${opts.days} days`}; when armed for real, this Play stays open for ${durationText(spec.window.lastsMin)}.`);
  }
  const anchor = inWindow[0]?.close ?? candles[0]!.close;
  const base: Omit<ReplayResult, "fired" | "pnlUsd" | "holding"> = {
    simulated: true,
    product,
    granularity: g,
    from: new Date(candles[0]!.t).toISOString(),
    to: new Date(candles[candles.length - 1]!.t + SECONDS[g] * 1000).toISOString(),
    series: downsample(candles, 240).map((c) => ({ t: new Date(c.t).toISOString(), close: c.close })),
    notes,
  };

  // 1. Find the trigger, intrabar.
  let fireIndex = -1;
  let firePrice = 0;
  for (let i = 0; i < inWindow.length; i++) {
    const c = inWindow[i]!;
    const hit = triggerHit(spec, c, anchor, windowStart);
    if (hit !== null) {
      fireIndex = i;
      firePrice = hit;
      break;
    }
  }
  if (fireIndex < 0) return { ...base, fired: false, pnlUsd: 0, holding: false };

  // 2. Fill, with the fee inside the spend (as Coinbase and Ghost do).
  const spend = spec.action.quoteUsd;
  const entryFee = spend * GHOST_TAKER_FEE;
  const qty = (spend - entryFee) / firePrice;
  const fired = inWindow[fireIndex]!;
  const entry = { at: new Date(fired.t).toISOString(), price: round(firePrice), base: qty, feeUsd: round(entryFee), spentUsd: spend };
  const trigger = { at: entry.at, price: round(firePrice) };

  // 3. Exits, from the next candle on.
  const { takeProfit, stopLoss } = spec.exit ? exitPrices(spec.exit, firePrice) : { takeProfit: undefined, stopLoss: undefined };
  for (const c of inWindow.slice(fireIndex + 1)) {
    const stopHit = stopLoss !== undefined && c.low <= stopLoss;
    const tpHit = takeProfit !== undefined && c.high >= takeProfit;
    if (stopHit || tpHit) {
      const price = stopHit ? stopLoss! : takeProfit!;
      return closeOut(base, trigger, entry, { at: new Date(c.t).toISOString(), price, reason: stopHit ? "stop_loss" : "take_profit" });
    }
  }
  if (spec.exit) notes.push("No exit level was reached in the range; the position is marked at the last price.");
  const last = candles[candles.length - 1]!;
  return { ...base, fired: true, trigger, entry, pnlUsd: round(qty * last.close - spend), holding: true };
}

function closeOut(
  base: Omit<ReplayResult, "fired" | "pnlUsd" | "holding">,
  trigger: ReplayResult["trigger"],
  entry: NonNullable<ReplayResult["entry"]>,
  exit: { at: string; price: number; reason: "take_profit" | "stop_loss" },
): ReplayResult {
  const gross = entry.base * exit.price;
  const fee = gross * GHOST_TAKER_FEE;
  return {
    ...base,
    fired: true,
    trigger,
    entry,
    exit: { ...exit, price: round(exit.price), feeUsd: round(fee) },
    pnlUsd: round(gross - fee - entry.spentUsd),
    holding: false,
  };
}

/** The price a trigger fired at inside a candle, or null. */
function triggerHit(spec: Cartridge, c: Candle, anchor: number, windowStart: number): number | null {
  const t = spec.trigger;
  if (t.kind === "time") {
    return evaluateTrigger(t, { anchorPrice: null, price: null, now: c.t, windowStart }).fired ? c.open : null;
  }
  if (t.kind === "price_cross") {
    if (t.direction === "above" && c.high >= t.price) return Math.max(t.price, c.open);
    if (t.direction === "below" && c.low <= t.price) return Math.min(t.price, c.open);
    return null;
  }
  const up = anchor * (1 + t.pct / 100);
  const down = anchor * (1 - t.pct / 100);
  if ((t.direction === "up" || t.direction === "either") && c.high >= up) return Math.max(up, c.open);
  if ((t.direction === "down" || t.direction === "either") && c.low <= down) return Math.min(down, c.open);
  return null;
}

function durationText(min: number): string {
  if (min < 60) return `${min} min`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  return `${Math.round((min / 60) * 10) / 10} hours`;
}

function downsample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  return Array.from({ length: max }, (_, i) => xs[Math.floor(i * step)]!).concat(xs[xs.length - 1]!);
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

const CandlesJson = z.object({
  candles: z.array(z.object({ start: z.string(), low: z.string(), high: z.string(), open: z.string(), close: z.string() })),
});

/** Coinbase's public candles; no key needed. */
export function publicCandles(fetchImpl: typeof fetch = fetch): CandleSource {
  return async (product, startSec, endSec, granularity) => {
    const url = `https://api.coinbase.com/api/v3/brokerage/market/products/${encodeURIComponent(product)}/candles?start=${startSec}&end=${endSec}&granularity=${granularity}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) throw new ReplayError(`Coinbase has no price history for ${product}.`);
    if (!res.ok) throw new ReplayError(`Price history unavailable (HTTP ${res.status}).`);
    return CandlesJson.parse(await res.json()).candles.map((c) => ({ t: Number(c.start) * 1000, open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
  };
}
