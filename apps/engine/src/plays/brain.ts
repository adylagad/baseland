import type { Cartridge } from "@baseland/play-schema";
import { symbolOf } from "@baseland/play-schema";
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
