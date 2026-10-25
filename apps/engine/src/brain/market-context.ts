import { z } from "zod";

// Free, real market context from Coinbase's public candles. The Brain always
// gets this without spending anything; paid Senses are extra.

const Candles = z.object({
  candles: z.array(z.object({ start: z.string(), low: z.string(), high: z.string(), open: z.string(), close: z.string(), volume: z.string() })),
});

export interface MarketContext {
  product: string;
  price: number;
  change1hPct: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  /** Last hour's volume relative to the 24h hourly average (1 = normal). */
  volume1hVsAvg: number;
  /** Simple direction of the last 6 five-minute candles. */
  shortTrend: "up" | "down" | "flat";
}

const BASE = "https://api.coinbase.com/api/v3/brokerage/market/products";

export async function marketContext(product: string, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<MarketContext> {
  const t = Math.floor(now / 1000);
  const get = async (granularity: string, seconds: number) => {
    const url = `${BASE}/${encodeURIComponent(product)}/candles?start=${t - seconds}&end=${t}&granularity=${granularity}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`candles unavailable for ${product} (HTTP ${res.status})`);
    // Newest first, as Coinbase returns them.
    return Candles.parse(await res.json()).candles.map((c) => ({ close: +c.close, high: +c.high, low: +c.low, volume: +c.volume }));
  };
  const [hourly, fives] = await Promise.all([get("ONE_HOUR", 24 * 3600), get("FIVE_MINUTE", 3600)]);
  if (!hourly.length || !fives.length) throw new Error(`no candles for ${product}`);
  return summarize(product, hourly, fives);
}

type C = { close: number; high: number; low: number; volume: number };

export function summarize(product: string, hourly: C[], fives: C[]): MarketContext {
  const price = fives[0]!.close;
  const hourAgo = fives[fives.length - 1]!.close;
  const dayAgo = hourly[hourly.length - 1]!.close;
  const avgHourVol = hourly.reduce((s, c) => s + c.volume, 0) / hourly.length;
  const lastHourVol = fives.reduce((s, c) => s + c.volume, 0);
  const recent = fives.slice(0, 6);
  const drift = recent.length > 1 ? (recent[0]!.close - recent[recent.length - 1]!.close) / recent[recent.length - 1]!.close : 0;
  const pct = (a: number, b: number) => Math.round(((a - b) / b) * 10000) / 100;
  return {
    product,
    price,
    change1hPct: pct(price, hourAgo),
    change24hPct: pct(price, dayAgo),
    high24h: Math.max(...hourly.map((c) => c.high)),
    low24h: Math.min(...hourly.map((c) => c.low)),
    volume1hVsAvg: avgHourVol > 0 ? Math.round((lastHourVol / avgHourVol) * 100) / 100 : 1,
    shortTrend: drift > 0.001 ? "up" : drift < -0.001 ? "down" : "flat",
  };
}
