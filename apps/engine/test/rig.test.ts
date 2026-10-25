import { describe, expect, it } from "vitest";
import { examples, type CartridgeInput } from "@baseland/play-schema";
import { GhostEvidence } from "../src/brain/evidence.js";
import { senseById } from "../src/brain/senses.js";
import { RuleBrain, type Brain } from "../src/plays/brain.js";
import { harness } from "./harness.js";

const ALICE = "alice";
const clone = <T>(x: T): T => structuredClone(x);

describe("the Rig, applied by the runtime", () => {
  it("Leash: the Rig's caps sit on top of every Play's own", async () => {
    const h = harness({ rig: { leash: { maxOrderUsd: 2 } } });
    await h.price("ETH-USDC", 2000);
    const c = { ...clone(examples.ethNow), action: { side: "BUY", product: "ETH-USDC", quoteUsd: 3 }, leash: { maxOrderUsd: 5, maxPlayUsd: 5 } } as CartridgeInput;
    expect(await h.create(ALICE, c, "ghost")).toMatchObject({ state: "failed", stateReason: "Leash: $3.00 is over the $2.00 order limit." });
  });

  it("Hands: an asset outside the Rig can't be bought", async () => {
    const h = harness({ rig: { hands: { assets: ["BTC"] } } });
    await h.price("ETH-USDC", 2000);
    expect(await h.create(ALICE, examples.ethNow, "ghost")).toMatchObject({ state: "failed", stateReason: "Leash: ETH isn't in your Rig's Hands." });
  });

  it("Brain: the Rig picks the Brain, and passes the user's instinct wording", async () => {
    const seen: { model?: string; instinct?: string } = {};
    const brainFor = (rig: { brain: { model: string } }): Brain => ({
      name: rig.brain.model,
      decide: async (ctx) => ((seen.model = rig.brain.model), (seen.instinct = ctx.instinctText), new RuleBrain().decide(ctx)),
    });
    const h = harness({ rig: { brain: { model: "claude-opus-5-5" }, instincts: { overrides: { momentum: "Only buy green candles." } } } });
    h.deps.brainFor = brainFor;
    await h.price("ETH-USDC", 2000);
    const c = { ...clone(examples.ethNow), decision: { instinct: "momentum", ask: "always" } } as CartridgeInput;
    await h.create(ALICE, c, "ghost");
    expect(seen).toEqual({ model: "claude-opus-5-5", instinct: "Only buy green candles." });
  });

  it("Senses: one switched off in the Rig can't be bought, even by a running Play", async () => {
    let offered: string[] = [];
    const spy: Brain = { name: "spy", decide: async (ctx) => ((offered = ctx.evidence?.senses ?? []), new RuleBrain().decide(ctx)) };
    const h = harness({ brain: spy, rig: { senses: { enabled: ["exa.news"] } } });
    h.deps.evidenceFor = async () => new GhostEvidence();
    await h.price("ETH-USDC", 2000);
    const c = { ...clone(examples.ethNow), evidence: { senses: ["exa.news", "nansen.flows"], budgetUsdc: 0.1 }, leash: { maxOrderUsd: 2, maxPlayUsd: 2, maxEvidenceUsdc: 0.1 } } as CartridgeInput;
    await h.create(ALICE, c, "ghost");
    expect(offered).toEqual(["exa.news"]);
    expect(senseById("nansen.flows")).toBeDefined();
  });
});
