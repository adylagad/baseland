import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { symbolOf } from "@baseland/play-schema";
import type { Brain, Decision, DecisionContext } from "../plays/brain.js";
import { INSTINCT_TEXT, type Instinct } from "./instincts.js";
import { marketContext } from "./market-context.js";
import { senseById } from "./senses.js";

// The Claude Brain: asked once, when a trigger fires. It may read free market
// context and buy evidence (within a budget the code enforces), then must call
// submit_decision. It never sees order tools; the runtime builds and checks
// the order (AGENTS.md hard rule 2).

export interface ClaudeBrainOptions {
  client?: Anthropic;
  model?: string;
  effort?: "low" | "medium" | "high";
  /** Injected for tests. */
  context?: typeof marketContext;
}

const DecisionInput = z.object({
  verdict: z.enum(["act", "skip", "wait"]).describe("act = place the Play's order; skip = end the Play without trading; wait = keep watching for a better moment"),
  headline: z.string().describe("One plain sentence for the Dynamic Island, at most 90 characters, ending with the proposed action as a question if acting (e.g. 'Breakout on 1.8x volume. Buy $3 of ETH?')"),
  quoteUsd: z.number().nullable().describe("For BUY Plays: the amount to spend, at most the Play's amount. Null to use the Play's amount."),
  reasons: z.array(z.string()).describe("Up to three short reasons"),
});

const SYSTEM = `You are the Brain of Baseland, a trading agent that runs short, event-scoped "Plays" for one person.
A Play's trigger just fired. Decide whether to act on it now.

How you work:
- Call market_context first. It is free and real.
- buy_evidence costs money (USDC, per call) and comes out of a small budget. Buy only what could change your decision, never more than two sources. If a purchase is marked GHOST, no data came back: decide from market context and say so.
- Finish by calling submit_decision exactly once. Do not reply with prose instead.

Rules you cannot change:
- You only recommend. The engine enforces hard limits, previews every order and may ask the person to approve.
- Never propose spending more than the Play's amount.
- The headline is read on a phone's Dynamic Island: one short plain sentence, no emojis, no hedging boilerplate.`;

export class ClaudeBrain implements Brain {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: "low" | "medium" | "high";
  private readonly context: typeof marketContext;

  constructor(opts: ClaudeBrainOptions = {}) {
    this.client = opts.client ?? new Anthropic({ timeout: 60_000, maxRetries: 1 });
    this.model = opts.model ?? "claude-opus-5-5";
    this.effort = opts.effort ?? "medium";
    this.context = opts.context ?? marketContext;
    this.name = this.model;
  }

  async decide(ctx: DecisionContext): Promise<Decision> {
    const { spec } = ctx;
    const products = [...new Set([spec.action.product, ...(spec.trigger.kind === "time" ? [] : [spec.trigger.product])])];
    let decision: z.infer<typeof DecisionInput> | null = null;
    let spent = 0;

    const tools = [
      betaZodTool({
        name: "market_context",
        description: `Free live Coinbase stats for a product: price, 1h and 24h change, 24h range, volume vs average, short trend. Allowed products: ${products.join(", ")}.`,
        inputSchema: z.object({ product: z.string() }),
        run: async ({ product }) => {
          if (!products.includes(product)) return `Not allowed: use one of ${products.join(", ")}.`;
          return JSON.stringify(await this.context(product));
        },
      }),
      ...(ctx.evidence && ctx.evidence.senses.length && ctx.evidence.remainingUsdc > 0
        ? [this.evidenceTool(ctx, () => spent, (x) => (spent += x))]
        : []),
      betaZodTool({
        name: "submit_decision",
        description: "Record your final decision. Call exactly once, last.",
        inputSchema: DecisionInput,
        run: async (input) => {
          decision = input;
          return "Recorded.";
        },
      }),
    ];

    const a = spec.action;
    const situation = [
      `Play: "${spec.title}" (${ctx.play.mode === "ghost" ? "GHOST: simulated money" : "LIVE: real money"}).`,
      `What fired: ${ctx.triggerSummary}${ctx.price !== null ? ` at ${ctx.price}` : ""}.`,
      a.side === "BUY" ? `Proposed action: buy $${a.quoteUsd} of ${symbolOf(a.product)} (${a.product}).` : `Proposed action: sell ${a.baseSize} ${symbolOf(a.product)} (${a.product}).`,
      spec.exit ? `Exits if bought: ${spec.exit.takeProfitPct ? `take profit +${spec.exit.takeProfitPct}%` : ""}${spec.exit.takeProfitPct && spec.exit.stopLossPct ? ", " : ""}${spec.exit.stopLossPct ? `stop loss -${spec.exit.stopLossPct}%` : ""}.` : "No exits set.",
      `Instinct: ${INSTINCT_TEXT[(spec.decision.instinct as Instinct) in INSTINCT_TEXT ? (spec.decision.instinct as Instinct) : "steady"]}`,
      ctx.evidence?.senses.length ? `Evidence budget left: $${ctx.evidence.remainingUsdc.toFixed(3)} USDC.` : "No evidence budget: decide from market context.",
    ].join("\n");

    const final = await this.client.beta.messages.toolRunner({
      model: this.model,
      max_tokens: 16000,
      output_config: { effort: this.effort },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: situation }],
      tools,
      max_iterations: 8,
    });

    if (final.stop_reason === "refusal") throw new Error("the model declined to decide");
    const d = decision as z.infer<typeof DecisionInput> | null;
    if (!d) throw new Error("the model finished without submitting a decision");
    return {
      verdict: d.verdict,
      headline: d.headline.slice(0, 120),
      quoteUsd: a.side === "BUY" ? Math.min(d.quoteUsd ?? a.quoteUsd, a.quoteUsd) : undefined,
      evidenceCostUsdc: Math.round(spent * 1e6) / 1e6,
      reasons: d.reasons.slice(0, 3),
      by: this.name,
    };
  }

  private evidenceTool(ctx: DecisionContext, spent: () => number, add: (x: number) => void) {
    const ev = ctx.evidence!;
    const allowed = ev.senses.map(senseById).filter((s) => s !== undefined);
    const menu = allowed.map((s) => `${s.id} ($${s.priceUsdc}): ${s.use}`).join("; ");
    return betaZodTool({
      name: "buy_evidence",
      description: `Pay for one evidence source over x402. Costs real USDC unless marked GHOST. Sources: ${menu}.`,
      inputSchema: z.object({
        sense: z.string().describe(`One of: ${allowed.map((s) => s.id).join(", ")}`),
        query: z.string().describe("What to look up, e.g. 'ETH ETF news today'"),
      }),
      run: async ({ sense, query }) => {
        const s = allowed.find((x) => x.id === sense);
        if (!s) return `Unknown or disallowed source. Choose from: ${allowed.map((x) => x.id).join(", ")}.`;
        const remaining = ev.remainingUsdc - spent();
        if (s.priceUsdc > remaining + 1e-9) return `Over budget: ${s.id} costs $${s.priceUsdc}, $${remaining.toFixed(3)} left. Decide without it.`;
        const receipt = await ev.provider.fetch(s, query, { maxUsdc: remaining });
        add(receipt.costUsdc);
        await ev.record(receipt);
        return receipt.content;
      },
    });
  }
}
