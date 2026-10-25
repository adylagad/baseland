import { z } from "zod";
import { INSTINCTS } from "./draft.js";

// The Rig: how one person's agent is put together. Every slot changes
// behaviour, not just display. The engine applies it at decision time, so an
// edit affects running Plays from their next step.
//
// `.prefault` (not `.default`) so a partial or empty Rig still gets every
// nested default (zod 4 returns `.default` values unparsed).

export const BRAIN_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "rules"] as const;
export const RIG_ASSETS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "LINK", "AVAX", "ADA"] as const;

export const Rig = z.object({
  brain: z
    .object({
      model: z.enum(BRAIN_MODELS).default("claude-sonnet-5-5"),
      effort: z.enum(["low", "medium", "high"]).default("medium"),
    })
    .prefault({}),
  senses: z
    .object({
      /** Sense ids the agent may buy from. Applies to running Plays too. */
      enabled: z.array(z.string().min(1)).max(20).default(["exa.news", "nansen.flows"]),
      /** Evidence budget given to new Plays, in USDC. */
      budgetUsdc: z.number().min(0).max(1).default(0.1),
    })
    .prefault({}),
  instincts: z
    .object({
      /** Your own wording for an instinct, replacing the built-in text. */
      overrides: z.partialRecord(z.enum(INSTINCTS), z.string().trim().min(1).max(600)).default({}),
    })
    .prefault({}),
  hands: z
    .object({
      /** Assets the agent may trade, as symbols. */
      assets: z.array(z.string().regex(/^[A-Z0-9]{1,12}$/)).min(1).max(30).default([...RIG_ASSETS]),
      /** Approval policy for new Plays. */
      // Same shape as the cartridge's Ask; defined here to avoid an import
      // cycle with index.ts.
      ask: z.union([z.literal("always"), z.literal("never"), z.object({ aboveUsd: z.number().positive() })]).default("always"),
    })
    .prefault({}),
  leash: z
    .object({
      /** Caps on top of every Play's own Leash. */
      maxOrderUsd: z.number().positive().max(100).default(10),
      maxPlayUsd: z.number().positive().max(500).default(25),
      maxEvidenceUsdc: z.number().min(0).max(5).default(0.25),
    })
    .prefault({}),
});

export type Rig = z.infer<typeof Rig>;
export const defaultRig = (): Rig => Rig.parse({});
