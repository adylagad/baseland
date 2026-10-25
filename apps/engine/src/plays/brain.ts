import type { Cartridge } from "@baseland/play-schema";
import { symbolOf } from "@baseland/play-schema";
import type { EvidenceProvider, EvidenceReceipt } from "../brain/evidence.js";
import type { PlayRecord } from "./store.js";

// The Brain decides at exactly one moment: when a trigger fires. It returns a
// structured verdict and never touches money; the runtime turns an "act"
// into an order and the Leash checks it (AGENTS.md hard rule 2).
//
// Phase 1 ships RuleBrain (no AI). Phase 2 adds a Claude Brain that buys x402
// evidence first; both satisfy this interface.

export interface DecisionContext {
  play: PlayRecord;
  spec: Cartridge;
  price: number | null;
  /** What fired, in words, for the Tape and the headline. */
  triggerSummary: string;
  /** Evidence the Brain may buy for this decision; absent = none. */
  evidence?: EvidenceHandle;
  /** The user's own wording for this Play's instinct (from the Rig). */
  instinctText?: string;
}

export interface EvidenceHandle {
  provider: EvidenceProvider;
  /** Sense ids this Play may buy from. */
  senses: string[];
  /** What this Play may still spend on evidence, in USDC (enforced by the runtime). */
  remainingUsdc: number;
  /** Writes the receipt to the Tape. Called once per purchase. */
  record(receipt: EvidenceReceipt): Promise<void>;
  /** The idempotency key for the next purchase from this Sense, re-derivable from the Tape. */
  keyFor?(senseId: string): Promise<string>;
}

export interface Decision {
  verdict: "act" | "skip" | "wait";
  /** One line for the Island: why. */
  headline: string;
  /** For BUY: the amount to spend, never above the cartridge's. */
  quoteUsd?: number;
  /** x402 spend incurred while deciding (Phase 2). */
  evidenceCostUsdc: number;
  /** Which brain decided, for the Tape. */
  by: string;
  /** Up to three short reasons, for the Tape. */
  reasons?: string[];
}

export interface Brain {
  readonly name: string;
  decide(ctx: DecisionContext): Promise<Decision>;
}

/** Always proposes exactly the cartridge's action. Deterministic. */
export class RuleBrain implements Brain {
  readonly name = "rules";

  async decide({ spec, price, triggerSummary }: DecisionContext): Promise<Decision> {
    const a = spec.action;
    const what =
      a.side === "BUY" ? `Buy $${a.quoteUsd.toFixed(2)} of ${symbolOf(a.product)}` : `Sell ${a.baseSize} ${symbolOf(a.product)}`;
    const at = price !== null ? ` at ${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "";
    return {
      verdict: "act",
      headline: `${triggerSummary}${at}. ${what}?`,
      quoteUsd: a.side === "BUY" ? a.quoteUsd : undefined,
      evidenceCostUsdc: 0,
      by: this.name,
    };
  }
}

/**
 * Tries the primary Brain and falls back (e.g. to rules) if it fails, so a
 * flaky network or a missing API key degrades a decision instead of failing
 * the Play. The Tape records which one decided.
 */
export class FallbackBrain implements Brain {
  readonly name: string;

  constructor(
    private readonly primary: Brain,
    private readonly fallback: Brain,
    private readonly onFallback: (err: unknown) => void = () => {},
  ) {
    this.name = `${primary.name}→${fallback.name}`;
  }

  async decide(ctx: DecisionContext): Promise<Decision> {
    try {
      return await this.primary.decide(ctx);
    } catch (err) {
      this.onFallback(err);
      const d = await this.fallback.decide(ctx);
      return { ...d, by: `${this.fallback.name} (${this.primary.name} unavailable)` };
    }
  }
}
