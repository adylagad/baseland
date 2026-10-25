import { describe, expect, it } from "vitest";
import { deterministicKey, X402Evidence } from "../src/brain/evidence.js";
import { senseById } from "../src/brain/senses.js";
import type { CliRunner } from "../src/coinbase/cli.js";

const key = { keyId: "k", secret: "s" };

function fakeRun() {
  const calls: string[][] = [];
  const run = (async (args: string[]) => {
    calls.push(args);
    return { status: 200, body: { data: [{ smart_trader_net_flow_usd: 1234 }] } };
  }) as unknown as CliRunner;
  return { run, calls };
}

describe("X402Evidence (real payments, faked CLI)", () => {
  it("sends the Sense's own input, capped at the price and the budget, with the given key", async () => {
    const { run, calls } = fakeRun();
    const nansen = senseById("nansen.flows")!;
    const r = await new X402Evidence(run, key, "pf-1").fetch(nansen, "smart money on ETH", {
      maxUsdc: 0.1,
      product: "ETH-USDC",
      idempotencyKey: "11111111-2222-4333-a444-555555555555",
    });
    expect(calls[0]).toEqual([
      "x402", "fetch",
      "resource=https://api.nansen.ai/api/v1/tgm/flow-intelligence",
      `input:=${JSON.stringify({ chain: "ethereum", token_address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", timeframe: "1d" })}`,
      "max_amount=10000",
      "idempotency_key=11111111-2222-4333-a444-555555555555",
      "portfolio_id=pf-1",
    ]);
    expect(r).toMatchObject({ simulated: false, costUsdc: 0.01, senseId: "nansen.flows" });
    expect(r.content).toContain("smart_trader_net_flow_usd");
  });

  it("never sends max_amount above the remaining budget", async () => {
    const { run, calls } = fakeRun();
    await new X402Evidence(run, key, "pf-1").fetch(senseById("nansen.flows")!, "", { maxUsdc: 0.01, product: "BTC-USDC", idempotencyKey: "k1" });
    expect(calls[0]).toContain("max_amount=10000");
    await expect(
      new X402Evidence(run, key, "pf-1").fetch(senseById("glassnode.funding")!, "", { maxUsdc: 0.02, product: "ETH-USDC", idempotencyKey: "k2" }),
    ).rejects.toThrow(/over the remaining budget/);
    expect(calls).toHaveLength(1);
  });

  it("refuses to pay without a persisted key, or for an asset the Sense can't look up", async () => {
    const { run, calls } = fakeRun();
    const nansen = senseById("nansen.flows")!;
    await expect(new X402Evidence(run, key, "pf-1").fetch(nansen, "", { maxUsdc: 0.1, product: "ETH-USDC" })).rejects.toThrow(/idempotency key/);
    await expect(new X402Evidence(run, key, "pf-1").fetch(nansen, "", { maxUsdc: 0.1, product: "SOL-USDC", idempotencyKey: "k" })).rejects.toThrow(/no data for SOL-USDC/);
    expect(calls).toHaveLength(0);
  });

  it("derives the same UUID-shaped key from the same parts", () => {
    const a = deterministicKey("x402", "play-1", "nansen.flows", "0");
    expect(a).toBe(deterministicKey("x402", "play-1", "nansen.flows", "0"));
    expect(a).not.toBe(deterministicKey("x402", "play-1", "nansen.flows", "1"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
