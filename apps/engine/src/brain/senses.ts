// The Senses: x402 evidence sources a Play may buy from. Resource URLs and
// prices are from Coinbase's curated x402 catalog, read with the free
// `coinbase x402 resources` discovery call on 2026-10-24. Prices are per call,
// in USDC.

export interface Sense {
  id: string;
  label: string;
  provider: string;
  /** What it is good for, shown to the Brain. */
  use: string;
  assets: "crypto" | "stock" | "any";
  resource: string;
  priceUsdc: number;
  /**
   * The x402 request body, built from the Play's product. Only the fields
   * discovery lists for the resource (`coinbase x402 resources`). Without it
   * the Brain's free-text query is sent as `{ query }`.
   */
  input?(product: string, query: string): Record<string, unknown> | null;
}

// Nansen's flow intelligence takes a token contract: the wrapped token on
// Ethereum stands in for the native asset (discovery, 2026-10-25).
const NANSEN_TOKENS: Record<string, string> = {
  ETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  BTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
};

export const SENSES: readonly Sense[] = [
  { id: "exa.news", label: "Exa web + news search", provider: "Exa", use: "Recent news and web pages about an asset or event", assets: "any", resource: "https://api.exa.ai/search", priceUsdc: 0.025 },
  { id: "you.news", label: "You.com news search", provider: "You.com", use: "Real-time web and news search with fresh results", assets: "any", resource: "https://api.you.com/v1/search", priceUsdc: 0.105 },
  { id: "massive.news", label: "Massive stock news", provider: "Massive", use: "Latest news for a stock ticker", assets: "stock", resource: "https://agent.massive.com/v2/reference/news", priceUsdc: 0.01 },
  { id: "massive.stocks", label: "Massive stock snapshot", provider: "Massive", use: "Up-to-date price and day stats for a stock ticker", assets: "stock", resource: "https://agent.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/{stocksTicker}", priceUsdc: 0.01 },
  { id: "glassnode.funding", label: "Glassnode perp funding rate", provider: "Glassnode", use: "Whether futures traders are crowded long or short", assets: "crypto", resource: "https://x402.glassnode.com/v1/metrics/derivatives/futures_funding_rate_perpetual", priceUsdc: 0.05 },
  { id: "glassnode.exchange_balance", label: "Glassnode exchange balances", provider: "Glassnode", use: "Coins moving onto or off exchanges (sell or hold pressure)", assets: "crypto", resource: "https://x402.glassnode.com/v1/metrics/distribution/balance_exchanges", priceUsdc: 0.05 },
  { id: "nansen.flows", label: "Nansen smart-money flows", provider: "Nansen", use: "Whale and smart-money inflows/outflows for a token", assets: "crypto", resource: "https://api.nansen.ai/api/v1/tgm/flow-intelligence", priceUsdc: 0.01,
    input: (product) => {
      const token = NANSEN_TOKENS[product.split("-")[0] ?? ""];
      return token ? { chain: "ethereum", token_address: token, timeframe: "1d" } : null;
    } },
  { id: "nansen.netflow", label: "Nansen smart-money netflow", provider: "Nansen", use: "Aggregate smart-money net buying across chains", assets: "crypto", resource: "https://api.nansen.ai/api/v1/smart-money/netflow", priceUsdc: 0.05 },
  { id: "arkham.trending", label: "Arkham trending tokens", provider: "Arkham", use: "Which tokens are trending right now", assets: "crypto", resource: "https://api.arkm.com/x402/token/trending", priceUsdc: 0.2 },
];

export const senseById = (id: string) => SENSES.find((s) => s.id === id);
