import { describe, expect, it } from "vitest";
import { examples, type CartridgeInput } from "@baseland/play-schema";
import { GhostEvidence } from "../src/brain/evidence.js";
import { summarize } from "../src/brain/market-context.js";
import { senseById, SENSES } from "../src/brain/senses.js";
import { FallbackBrain, RuleBrain, type Brain } from "../src/plays/brain.js";
import { harness } from "./harness.js";

const ALICE = "alice";

describe("Senses", () => {
  it("are unique, priced from the catalog, and within the x402 per-call cap", () => {
    expect(new Set(SENSES.map((s) => s.id)).size).toBe(SENSES.length);
    for (const s of SENSES) {
      expect(s.priceUsdc).toBeGreaterThan(0);
      expect(s.priceUsdc).toBeLessThanOrEqual(5);
      expect(s.resource).toMatch(/^https:\/\//);
    }
    // The reference cartridges only name Senses that exist.
    for (const c of Object.values(examples)) for (const id of c.evidence?.senses ?? []) expect(senseById(id), id).toBeDefined();
  });
});

describe("GhostEvidence", () => {
  it("records the real price, fetches nothing, and says so", async () => {
    const r = await new GhostEvidence().fetch(senseById("exa.news")!, "ETH news", { maxUsdc: 0.1 });
    expect(r).toMatchObject({ senseId: "exa.news", costUsdc: 0.025, simulated: true, query: "ETH news" });
    expect(r.content).toMatch(/^GHOST purchase/);
  });
  it("refuses a purchase over the remaining budget", async () => {
    await expect(new GhostEvidence().fetch(senseById("arkham.trending")!, "x", { maxUsdc: 0.1 })).rejects.toThrow("over the remaining budget");
  });
});

describe("market context", () => {
  it("summarizes candles (newest first)", () => {
    const hourly = Array.from({ length: 24 }, (_, i) => ({ close: 2400 - i * 2, high: 2410 - i * 2, low: 2390 - i * 2, volume: 10 }));
    const fives = Array.from({ length: 12 }, (_, i) => ({ close: 2400 - i, high: 2401 - i, low: 2399 - i, volume: 2 }));
    expect(summarize("ETH-USDC", hourly, fives)).toEqual({
      product: "ETH-USDC", price: 2400, change1hPct: 0.46, change24hPct: 1.95, high24h: 2410, low24h: 2344,
      volume1hVsAvg: 2.4, shortTrend: "up",
    });
  });
});

describe("evidence inside the runtime", () => {
  /** A Brain that tries to buy every allowed Sense, then acts. */
  const shopper: Brain = {
    name: "shopper",
    async decide(ctx) {
      let spent = 0;
      for (const id of ctx.evidence?.senses ?? []) {
        const sense = senseById(id)!;
        if (sense.priceUsdc > ctx.evidence!.remainingUsdc - spent) continue;
        const r = await ctx.evidence!.provider.fetch(sense, "q", { maxUsdc: ctx.evidence!.remainingUsdc - spent });
        spent += r.costUsdc;
        await ctx.evidence!.record(r);
      }
      return { verdict: "act", headline: "ok", quoteUsd: 3, evidenceCostUsdc: spent, by: "shopper" };
    },
  };

  it("hands the Brain the Play's budget, writes receipts, and never counts spend twice", async () => {
    const h = harness({ brain: shopper });
    h.deps.evidenceFor = async () => new GhostEvidence();
    await h.price("ETH-USDC", 2300);
    const c = structuredClone(examples.ethBreakout) as CartridgeInput;
    c.evidence = { senses: ["exa.news", "nansen.flows", "you.news"], budgetUsdc: 0.1 };
    const play = await h.create(ALICE, c, "ghost");
    await h.price("ETH-USDC", 2401);

    const tape = await h.store.tape(play.id);
    const receipts = tape.filter((t) => t.kind === "evidence");
    // $0.025 + $0.01 fit; You.com at $0.105 would break the $0.10 budget.
    expect(receipts.map((r) => r.payload.senseId)).toEqual(["exa.news", "nansen.flows"]);
    expect(receipts.every((r) => r.simulated)).toBe(true);
    const total = tape.reduce((s, t) => s + (t.costUsdc ?? 0), 0);
    expect(total).toBeCloseTo(0.035, 6);
    expect(tape.find((t) => t.kind === "decision")!.costUsdc).toBe(0);
  });

  it("gives no evidence handle when the Play names no Senses", async () => {
    let saw: unknown = "unset";
    const spy: Brain = { name: "spy", decide: async (ctx) => ((saw = ctx.evidence), new RuleBrain().decide(ctx)) };
    const h = harness({ brain: spy });
    h.deps.evidenceFor = async () => new GhostEvidence();
    await h.price("ETH-USDC", 2000);
    await h.create(ALICE, examples.ethNow, "ghost");
    expect(saw).toBeUndefined();
  });
});

describe("FallbackBrain", () => {
  it("uses the fallback when the primary fails, and says so", async () => {
    const broken: Brain = { name: "claude-opus-5-5", decide: async () => { throw new Error("network down"); } };
    const errors: unknown[] = [];
    const h = harness({ brain: new FallbackBrain(broken, new RuleBrain(), (e) => errors.push(e)) });
    await h.price("ETH-USDC", 2000);
    const play = await h.create(ALICE, examples.ethNow, "ghost");
    expect(play.state).toBe("awaiting");
    const decision = (await h.store.tape(play.id)).find((t) => t.kind === "decision")!;
    expect(decision.payload.by).toBe("rules (claude-opus-5-5 unavailable)");
    expect(errors).toHaveLength(1);
  });
});

describe("model options", () => {
  it("sends refusal fallbacks only to models that support them", async () => {
    const { fallbackOptions, DEFAULT_BRAIN_MODEL, DEFAULT_DRAFT_MODEL } = await import("../src/brain/models.js");
    expect(DEFAULT_BRAIN_MODEL).toBe("claude-sonnet-5-5");
    expect(DEFAULT_DRAFT_MODEL).toBe("claude-haiku-5-5");
    expect(fallbackOptions("claude-sonnet-5-5")).toEqual({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(fallbackOptions("claude-opus-5-5").fallbacks).toBe("default");
    expect(fallbackOptions("claude-haiku-5-5")).toEqual({});
  });
});
