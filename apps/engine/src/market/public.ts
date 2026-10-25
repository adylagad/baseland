import { z } from "zod";

// Coinbase's public market endpoints need no key, so Ghost mode and watchers
// work for users who never connect an account.

const PUBLIC_BASE = "https://api.coinbase.com/api/v3/brokerage/market";

const Product = z.object({
  product_id: z.string(),
  price: z.string(),
  price_percentage_change_24h: z.string().optional(),
  quote_min_size: z.string().optional(),
  status: z.string().optional(),
});

export interface Quote {
  productId: string;
  price: number;
  change24hPct: number | null;
  at: string;
}

export type MarketData = {
  quote(productId: string): Promise<Quote>;
};

export function createPublicMarket(fetchImpl: typeof fetch = fetch): MarketData {
  return {
    async quote(productId) {
      const res = await fetchImpl(`${PUBLIC_BASE}/products/${encodeURIComponent(productId)}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 404) throw new MarketError(`unknown product ${productId}`, 404);
      if (!res.ok) throw new MarketError(`market data unavailable (HTTP ${res.status})`, 502);
      const p = Product.parse(await res.json());
      const change = p.price_percentage_change_24h ? Number(p.price_percentage_change_24h) : null;
      return {
        productId: p.product_id,
        price: Number(p.price),
        change24hPct: change,
        at: new Date().toISOString(),
      };
    },
  };
}

export class MarketError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MarketError";
  }
}
