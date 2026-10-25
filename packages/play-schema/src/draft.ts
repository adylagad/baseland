import { z } from "zod";
import type { CartridgeInput, SentencePart } from "./index.js";

// A Draft is what a model writes when it proposes a Play: flat, nullable
// fields only, so it fits structured outputs. Code, never the model, turns a
// Draft into a cartridge: the product id comes from a lookup (AGENTS.md),
// and the chip sentence is generated here so every chip points at a real
// field.

export const INSTINCTS = ["steady", "momentum", "contrarian", "hedger"] as const;

export const Draft = z.object({
  title: z.string().describe("2-5 words, e.g. 'ETH breakout'"),
  symbol: z.string().describe("Ticker symbol only, e.g. ETH, BTC, NVDA"),
  assetClass: z.enum(["crypto", "stock"]),
  triggerKind: z.enum(["price_cross", "pct_move", "time"]),
  direction: z.enum(["above", "below", "up", "down", "either"]).nullable().describe("above/below for price_cross; up/down/either for pct_move; null for time"),
  price: z.number().nullable().describe("Level for price_cross, in USD"),
  pct: z.number().nullable().describe("Percent for pct_move, e.g. 3 for 3%"),
  afterMin: z.number().nullable().describe("Minutes after the window opens, for time; 0 = now"),
  side: z.enum(["BUY", "SELL"]),
  amountUsd: z.number().nullable().describe("USD to spend for BUY"),
  baseSize: z.string().nullable().describe("Amount of the asset to sell for SELL, as a decimal string"),
  lastsMin: z.number().describe("How long the Play stays open, in minutes"),
  startsInMin: z.number().describe("Minutes until the window opens; 0 = now"),
  takeProfitPct: z.number().nullable(),
  stopLossPct: z.number().nullable(),
  ask: z.enum(["always", "never"]).describe("Whether to ask the user before trading; default always"),
  instinct: z.enum(INSTINCTS),
});
export type Draft = z.infer<typeof Draft>;

const round = (x: number, dp = 2) => Math.round(x * 10 ** dp) / 10 ** dp;

/** "90" → "1h 30m", "1440" → "1d". */
export function durationLabel(min: number): string {
  if (min < 60) return `${min}m`;
  if (min % 1440 === 0) return `${min / 1440}d`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const usdLabel = (x: number) =>
  `$${x.toLocaleString("en-US", { minimumFractionDigits: x % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/**
 * Builds a cartridge from a Draft. `product` must come from a real lookup.
 * Leash defaults to exactly the order size, so a drafted Play can never
 * spend more than it says.
 */
export function cartridgeFromDraft(
  d: Draft,
  product: string,
  opts: { senses?: string[]; evidenceBudgetUsdc?: number } = {},
): CartridgeInput {
  const trigger =
    d.triggerKind === "price_cross"
      ? { kind: "price_cross" as const, product, direction: d.direction === "below" ? ("below" as const) : ("above" as const), price: round(d.price ?? 0, 6) }
      : d.triggerKind === "pct_move"
        ? { kind: "pct_move" as const, product, direction: d.direction === "up" || d.direction === "down" ? d.direction : ("either" as const), pct: round(d.pct ?? 1, 3) }
        : { kind: "time" as const, afterMin: Math.max(0, Math.round(d.afterMin ?? 0)) };

  const action =
    d.side === "BUY"
      ? { side: "BUY" as const, product, quoteUsd: round(d.amountUsd ?? 0) }
      : { side: "SELL" as const, product, baseSize: d.baseSize ?? "0" };
  const orderUsd = d.side === "BUY" ? round(d.amountUsd ?? 0) : 25;

  const exit =
    d.side === "BUY" && (d.takeProfitPct || d.stopLossPct)
      ? {
          ...(d.takeProfitPct ? { takeProfitPct: round(d.takeProfitPct, 3) } : {}),
          ...(d.stopLossPct ? { stopLossPct: round(d.stopLossPct, 3) } : {}),
        }
      : undefined;

  const budget = round(opts.evidenceBudgetUsdc ?? 0.1, 4);
  const base: CartridgeInput = {
    version: 1,
    title: d.title.slice(0, 60),
    sentence: [{ kind: "text", text: "…" }],
    window: { startsInMin: Math.max(0, Math.round(d.startsInMin)), lastsMin: Math.max(1, Math.round(d.lastsMin)) },
    trigger,
    evidence: { senses: opts.senses ?? [], budgetUsdc: budget },
    decision: { instinct: d.instinct, ask: d.ask },
    action,
    ...(exit ? { exit } : {}),
    leash: { maxOrderUsd: orderUsd, maxPlayUsd: orderUsd, maxEvidenceUsdc: budget, allowedProducts: [product] },
  };
  return { ...base, sentence: sentenceFor(base) };
}

/**
 * The chip sentence for a cartridge. Deterministic, so the app and the
 * engine always agree, and regenerated whenever a chip is edited.
 */
export function sentenceFor(c: CartridgeInput): SentencePart[] {
  const parts: SentencePart[] = [];
  const text = (t: string) => parts.push({ kind: "text", text: t });
  const chip = (id: string, field: string, label: string) => parts.push({ kind: "chip", id, field, label });
  const sym = (p: string) => p.split("-")[0] ?? p;

  const startsIn = c.window.startsInMin ?? 0;
  if (startsIn > 0) {
    text("Starting in ");
    chip("starts", "window.startsInMin", durationLabel(startsIn));
    text(", ");
  }

  const t = c.trigger;
  const lead = startsIn > 0 ? "if " : "If ";
  if (t.kind === "price_cross") {
    text(lead);
    chip("product", "trigger.product", sym(t.product));
    text(t.direction === "above" ? " breaks above " : " drops below ");
    chip("level", "trigger.price", usdLabel(t.price));
    text(" in the next ");
    chip("window", "window.lastsMin", durationLabel(c.window.lastsMin));
    text(", ");
  } else if (t.kind === "pct_move") {
    text(lead);
    chip("product", "trigger.product", sym(t.product));
    text(t.direction === "up" ? " jumps " : t.direction === "down" ? " drops " : " moves ");
    chip("pct", "trigger.pct", `${t.pct}%`);
    text(" in the next ");
    chip("window", "window.lastsMin", durationLabel(c.window.lastsMin));
    text(", ");
  } else if (t.afterMin > 0) {
    text(startsIn > 0 ? "after " : "After ");
    chip("after", "trigger.afterMin", durationLabel(t.afterMin));
    text(", ");
  }

  const a = c.action;
  const first = parts.length === 0;
  if (a.side === "BUY") {
    text(first ? "Buy " : "buy ");
    chip("amount", "action.quoteUsd", usdLabel(a.quoteUsd));
    text(" of ");
    chip("asset", "action.product", sym(a.product));
  } else {
    text(first ? "Sell " : "sell ");
    chip("amount", "action.baseSize", a.baseSize);
    text(" ");
    chip("asset", "action.product", sym(a.product));
  }
  text(t.kind === "time" && t.afterMin === 0 && startsIn === 0 ? " now" : "");

  if (c.exit?.takeProfitPct || c.exit?.stopLossPct) {
    text(". ");
    if (c.exit.takeProfitPct) {
      text("Take profit at ");
      chip("tp", "exit.takeProfitPct", `+${c.exit.takeProfitPct}%`);
    }
    if (c.exit.stopLossPct) {
      text(c.exit.takeProfitPct ? ", stop at " : "Stop at ");
      chip("sl", "exit.stopLossPct", `−${c.exit.stopLossPct}%`);
    }
  }
  text(".");
  return parts.filter((p) => p.kind === "chip" || p.text.length > 0);
}
