import { describe, expect, it } from "vitest";
import { Cartridge, examples, getPath, symbolOf, watchedProduct, type CartridgeInput } from "../src/index.js";

const clone = <T>(x: T): T => structuredClone(x);
const issues = (input: unknown) => {
  const r = Cartridge.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("example cartridges", () => {
  for (const [name, c] of Object.entries(examples)) {
    it(`${name} parses`, () => expect(issues(c)).toEqual([]));
  }

  it("fills defaults", () => {
    const c = Cartridge.parse(examples.btcDip);
    expect(c.window.startsInMin).toBe(0);
    expect(c.decision).toEqual({ instinct: "steady", ask: "always" });
    expect(c.evidence).toEqual({ senses: [], budgetUsdc: 0 });
    expect(c.leash.maxEvidenceUsdc).toBe(0.1);
  });
});

describe("cartridge rules", () => {
  it("rejects an order larger than the Leash", () => {
    const c = clone(examples.ethBreakout) as CartridgeInput & { action: { quoteUsd: number } };
    c.action.quoteUsd = 50;
    expect(issues(c)).toContain("action.quoteUsd: order is larger than the Leash's maxOrderUsd");
  });

  it("rejects a product the Leash doesn't allow", () => {
    const c = clone(examples.ethBreakout);
    c.action = { side: "BUY", product: "BTC-USDC", quoteUsd: 3 };
    expect(issues(c)).toContain("action.product: the Leash does not allow this product");
  });

  it("rejects an evidence budget above the Leash", () => {
    const c = clone(examples.ethBreakout);
    c.evidence = { senses: [], budgetUsdc: 0.5 };
    expect(issues(c)).toContain("evidence.budgetUsdc: evidence budget is larger than the Leash allows");
  });

  it("rejects exits on SELL Plays and empty exits", () => {
    const sell = clone(examples.ethBreakout);
    sell.action = { side: "SELL", product: "ETH-USDC", baseSize: "0.001" };
    expect(issues(sell)).toContain("exit: exits only apply to BUY Plays");

    const empty = clone(examples.ethBreakout);
    empty.exit = {};
    expect(issues(empty)).toContain("exit: an exit needs takeProfitPct, stopLossPct, or both");
  });

  it("rejects chips that point at missing fields", () => {
    const c = clone(examples.ethNow);
    c.sentence = [{ kind: "chip", id: "x", field: "action.nope", label: "?" }];
    expect(issues(c)).toContain('sentence.0.field: chip points at missing field "action.nope"');
  });

  it("rejects malformed product ids and mode smuggled into a cartridge is stripped", () => {
    const bad = clone(examples.ethNow);
    bad.action = { side: "BUY", product: "eth/usdc", quoteUsd: 2 };
    expect(issues(bad).some((i) => i.startsWith("action.product"))).toBe(true);

    const smuggled = { ...clone(examples.ethNow), mode: "live" };
    expect("mode" in Cartridge.parse(smuggled)).toBe(false);
  });
});

describe("helpers", () => {
  it("symbolOf, watchedProduct, getPath", () => {
    expect(symbolOf("ETH-USDC")).toBe("ETH");
    expect(watchedProduct(Cartridge.parse(examples.ethBreakout))).toBe("ETH-USDC");
    expect(watchedProduct(Cartridge.parse(examples.ethNow))).toBeNull();
    expect(getPath(examples.ethBreakout, "trigger.price")).toBe(2400);
  });
});
