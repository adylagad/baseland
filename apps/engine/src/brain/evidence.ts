import { createHash, randomUUID } from "node:crypto";
import type { CliRunner, CoinbaseKey } from "../coinbase/cli.js";
import type { Sense } from "./senses.js";

// Buying evidence. Two providers behind one interface:
// - GhostEvidence (the default; the user chose simulated purchases until the
//   portfolio is funded): records what the purchase would have cost at the
//   real catalog price and fetches nothing. Always labelled simulated.
// - X402Evidence: real payments through `coinbase x402 fetch`, from the
//   user's USDC. Off unless the engine is configured for it.

export interface EvidenceReceipt {
  senseId: string;
  provider: string;
  costUsdc: number;
  simulated: boolean;
  query: string;
  /** What the Brain reads back. */
  content: string;
  idempotencyKey: string;
}

export interface EvidenceOptions {
  maxUsdc: number;
  /** Persisted or re-derivable, so a retry after an unknown outcome reuses it. */
  idempotencyKey?: string;
  /** The Play's product, for Senses whose input names an asset. */
  product?: string;
}

export interface EvidenceProvider {
  readonly simulated: boolean;
  fetch(sense: Sense, query: string, opts: EvidenceOptions): Promise<EvidenceReceipt>;
}

/** A UUID-shaped key that is the same every time for the same parts. */
export function deterministicKey(...parts: string[]): string {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export class GhostEvidence implements EvidenceProvider {
  readonly simulated = true;

  async fetch(sense: Sense, query: string, opts: EvidenceOptions): Promise<EvidenceReceipt> {
    if (sense.priceUsdc > opts.maxUsdc + 1e-9) throw new Error(`${sense.label} costs $${sense.priceUsdc}, over the remaining budget`);
    return {
      senseId: sense.id,
      provider: sense.provider,
      costUsdc: sense.priceUsdc,
      simulated: true,
      query,
      idempotencyKey: opts.idempotencyKey ?? randomUUID(),
      content:
        `GHOST purchase: ${sense.label} would have cost $${sense.priceUsdc.toFixed(3)} via x402. ` +
        `No paid data was fetched (simulated evidence mode), so there is no ${sense.provider} result. ` +
        `Decide from the free market context and say so.`,
    };
  }
}

export class X402Evidence implements EvidenceProvider {
  readonly simulated = false;

  constructor(
    private readonly run: CliRunner,
    private readonly key: CoinbaseKey,
    /** The key's own portfolio pays. Coinbase refuses an x402 fetch without one. */
    private readonly portfolioId: string,
  ) {}

  async fetch(sense: Sense, query: string, opts: EvidenceOptions): Promise<EvidenceReceipt> {
    if (sense.priceUsdc > opts.maxUsdc + 1e-9) throw new Error(`${sense.label} costs $${sense.priceUsdc}, over the remaining budget`);
    const input = sense.input ? sense.input(opts.product ?? "", query) : { query };
    if (!input) throw new Error(`${sense.label} has no data for ${opts.product ?? "this asset"}`);
    // Hard rule 3: the key must survive a restart, so the caller derives it.
    if (!opts.idempotencyKey) throw new Error("a real x402 payment needs a persisted idempotency key");
    const idempotencyKey = opts.idempotencyKey;
    // max_amount never exceeds the catalog price or the Play's remaining budget.
    const maxAtomic = Math.floor(Math.min(opts.maxUsdc, sense.priceUsdc) * 1_000_000);
    const raw = await this.run(
      [
        "x402", "fetch",
        `resource=${sense.resource}`,
        `input:=${JSON.stringify(input)}`,
        `max_amount=${maxAtomic}`,
        `idempotency_key=${idempotencyKey}`,
        `portfolio_id=${this.portfolioId}`,
      ],
      this.key,
    );
    const content = JSON.stringify(raw).slice(0, 6000);
    return { senseId: sense.id, provider: sense.provider, costUsdc: sense.priceUsdc, simulated: false, query, idempotencyKey, content };
  }
}
