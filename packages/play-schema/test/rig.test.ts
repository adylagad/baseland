import { describe, expect, it } from "vitest";
import { defaultRig, Rig } from "../src/index.js";

describe("Rig", () => {
  it("fills every nested default from an empty or partial Rig", () => {
    expect(defaultRig()).toEqual({
      brain: { model: "claude-sonnet-5-5", effort: "medium" },
      senses: { enabled: ["exa.news", "nansen.flows"], budgetUsdc: 0.1 },
      instincts: { overrides: {} },
      hands: { assets: ["BTC", "ETH", "SOL", "XRP", "DOGE", "LINK", "AVAX", "ADA"], ask: "always" },
      leash: { maxOrderUsd: 10, maxPlayUsd: 25, maxEvidenceUsdc: 0.25 },
    });
    expect(Rig.parse({ brain: { model: "rules" } }).brain).toEqual({ model: "rules", effort: "medium" });
  });

  it("rejects unknown models, empty Hands, and runaway caps", () => {
    expect(Rig.safeParse({ brain: { model: "gpt-5" } }).success).toBe(false);
    expect(Rig.safeParse({ hands: { assets: [] } }).success).toBe(false);
    expect(Rig.safeParse({ leash: { maxOrderUsd: 1000 } }).success).toBe(false);
    expect(Rig.safeParse({ instincts: { overrides: { momentum: "x".repeat(601) } } }).success).toBe(false);
  });
});
