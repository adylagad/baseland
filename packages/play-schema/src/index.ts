import { z } from "zod";

// The Play cartridge: everything needed to run one Play, as a portable JSON
// document. Mode (ghost / live) is chosen when a cartridge is armed, never
// stored in it, so a shared cartridge can't arm itself live.

export const ProductId = z
  .string()
  .regex(/^[A-Z0-9]{1,12}-[A-Z0-9]{2,6}$/, "product ids look like ETH-USDC or AAPL-USD");

/** "ETH-USDC" → "ETH". */
export const symbolOf = (product: string) => product.split("-")[0] ?? product;

const Decimal = z.string().regex(/^\d+(\.\d+)?$/, "a positive decimal string");

// ------------------------------------------------------------------ sentence

/**
 * The chip sentence the user reads and edits. A chip points at the cartridge
 * field it edits (a dot path, e.g. "action.quoteUsd"), so the app can edit
 * cartridges without understanding them.
 */
export const SentencePart = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({
    kind: z.literal("chip"),
    id: z.string().min(1),
    field: z.string().min(1),
    label: z.string().min(1),
  }),
]);
export const Sentence = z.array(SentencePart).min(1);

// ------------------------------------------------------------------- trigger

export const Trigger = z.discriminatedUnion("kind", [
  /** Fires when the price crosses a level. */
  z.object({
    kind: z.literal("price_cross"),
    product: ProductId,
    direction: z.enum(["above", "below"]),
    price: z.number().positive(),
  }),
  /** Fires on a % move from the price when the window opened. */
  z.object({
    kind: z.literal("pct_move"),
    product: ProductId,
    direction: z.enum(["up", "down", "either"]),
    pct: z.number().positive().max(100),
  }),
  /** Fires a fixed time after the window opens (0 = immediately). */
  z.object({
    kind: z.literal("time"),
    afterMin: z.number().int().min(0),
  }),
]);
export type Trigger = z.infer<typeof Trigger>;

// -------------------------------------------------------------------- action

export const Action = z.discriminatedUnion("side", [
  /** Market buy spending a USD amount (Coinbase `quote_size`). */
  z.object({ side: z.literal("BUY"), product: ProductId, quoteUsd: z.number().positive() }),
  /** Market sell of a base amount (Coinbase `base_size`). */
  z.object({ side: z.literal("SELL"), product: ProductId, baseSize: Decimal }),
]);
export type Action = z.infer<typeof Action>;

// ------------------------------------------------------------------ approval

/** When the agent must ask before acting. */
export const Ask = z.union([
  z.literal("always"),
  z.literal("never"),
  z.object({ aboveUsd: z.number().positive() }),
]);
export type Ask = z.infer<typeof Ask>;

// -------------------------------------------------------------------- leash

export const Leash = z.object({
  /** Largest single order, in USD. */
  maxOrderUsd: z.number().positive(),
  /** Most this Play may spend on orders in total, in USD. */
  maxPlayUsd: z.number().positive(),
  /** Most this Play may spend on x402 evidence, in USDC. */
  maxEvidenceUsdc: z.number().min(0).max(5).default(0.1),
  /** If set, the only products this Play may trade. */
  allowedProducts: z.array(ProductId).optional(),
});
export type Leash = z.infer<typeof Leash>;

// ----------------------------------------------------------------- cartridge

const MAX_WINDOW_MIN = 7 * 24 * 60;

export const Cartridge = z
  .object({
    version: z.literal(1),
    title: z.string().min(1).max(60),
    sentence: Sentence,
    window: z.object({
      startsInMin: z.number().int().min(0).max(MAX_WINDOW_MIN).default(0),
      lastsMin: z.number().int().min(1).max(MAX_WINDOW_MIN),
    }),
    trigger: Trigger,
    evidence: z
      .object({
        senses: z.array(z.string().min(1)).max(5).default([]),
        budgetUsdc: z.number().min(0).max(5).default(0),
      })
      .default({ senses: [], budgetUsdc: 0 }),
    decision: z
      .object({
        instinct: z.string().min(1).default("steady"),
        ask: Ask.default("always"),
      })
      .default({ instinct: "steady", ask: "always" }),
    action: Action,
    /** Exits after a BUY fills. Live Plays attach them to the order itself. */
    exit: z
      .object({
        takeProfitPct: z.number().positive().max(100).optional(),
        stopLossPct: z.number().positive().max(50).optional(),
      })
      .optional(),
    leash: Leash,
  })
  .superRefine((c, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    if (c.action.side === "BUY" && c.action.quoteUsd > c.leash.maxOrderUsd) {
      issue(["action", "quoteUsd"], "order is larger than the Leash's maxOrderUsd");
    }
    if (c.leash.maxOrderUsd > c.leash.maxPlayUsd) {
      issue(["leash", "maxOrderUsd"], "maxOrderUsd cannot exceed maxPlayUsd");
    }
    if (c.evidence.budgetUsdc > c.leash.maxEvidenceUsdc) {
      issue(["evidence", "budgetUsdc"], "evidence budget is larger than the Leash allows");
    }
    if (c.leash.allowedProducts && !c.leash.allowedProducts.includes(c.action.product)) {
      issue(["action", "product"], "the Leash does not allow this product");
    }
    if (c.exit && c.action.side !== "BUY") {
      issue(["exit"], "exits only apply to BUY Plays");
    }
    if (c.exit && !c.exit.takeProfitPct && !c.exit.stopLossPct) {
      issue(["exit"], "an exit needs takeProfitPct, stopLossPct, or both");
    }
    for (const [i, part] of c.sentence.entries()) {
      if (part.kind === "chip" && getPath(c, part.field) === undefined) {
        issue(["sentence", i, "field"], `chip points at missing field "${part.field}"`);
      }
    }
  });

export type Cartridge = z.infer<typeof Cartridge>;
export type CartridgeInput = z.input<typeof Cartridge>;

/** The product a Play's watcher follows, if its trigger is price-based. */
export function watchedProduct(c: Cartridge): string | null {
  return c.trigger.kind === "time" ? null : c.trigger.product;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as never)[k] : undefined), obj);
}

// --------------------------------------------------------------------- state

export const PlayState = z.enum([
  "armed", "watching", "deciding", "awaiting", "executing",
  "done", "paused", "killed", "expired", "failed",
]);
export type PlayState = z.infer<typeof PlayState>;

export const TERMINAL_STATES: readonly PlayState[] = ["done", "killed", "expired", "failed"];
export const isTerminal = (s: PlayState) => TERMINAL_STATES.includes(s);

export const Mode = z.enum(["ghost", "live"]);
export type Mode = z.infer<typeof Mode>;

export { examples } from "./examples.js";
