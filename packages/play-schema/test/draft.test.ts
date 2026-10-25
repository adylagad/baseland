import { describe, expect, it } from "vitest";
import { Cartridge, cartridgeFromDraft, durationLabel, sentenceFor, type Draft } from "../src/index.js";

const draft: Draft = {
  title: "ETH breakout", symbol: "ETH", assetClass: "crypto",
  triggerKind: "price_cross", direction: "above", price: 2400, pct: null, afterMin: null,
  side: "BUY", amountUsd: 3, baseSize: null, lastsMin: 360, startsInMin: 0,
  takeProfitPct: 4, stopLossPct: 2, ask: "always", instinct: "momentum",
};

const render = (parts: ReturnType<typeof sentenceFor>) => parts.map((p) => (p.kind === "chip" ? `[${p.label}]` : p.text)).join("");

describe("cartridgeFromDraft", () => {
  it("builds a valid cartridge whose Leash is exactly the order", () => {
    const c = Cartridge.parse(cartridgeFromDraft(draft, "ETH-USDC", { senses: ["exa.news"] }));
    expect(c.trigger).toEqual({ kind: "price_cross", product: "ETH-USDC", direction: "above", price: 2400 });
    expect(c.action).toEqual({ side: "BUY", product: "ETH-USDC", quoteUsd: 3 });
    expect(c.leash).toEqual({ maxOrderUsd: 3, maxPlayUsd: 3, maxEvidenceUsdc: 0.1, allowedProducts: ["ETH-USDC"] });
    expect(c.exit).toEqual({ takeProfitPct: 4, stopLossPct: 2 });
    expect(render(c.sentence)).toBe("If [ETH] breaks above [$2,400] in the next [6h], buy [$3] of [ETH]. Take profit at [+4%], stop at [−2%].");
  });

  it("phrases pct moves, delayed windows and buy-now", () => {
    const dip = cartridgeFromDraft({ ...draft, triggerKind: "pct_move", direction: "down", pct: 3, price: null, lastsMin: 1440, takeProfitPct: null, stopLossPct: null, startsInMin: 60 }, "BTC-USDC");
    expect(render(dip.sentence)).toBe("Starting in [1h], if [BTC] drops [3%] in the next [1d], buy [$3] of [BTC].");
    const now = cartridgeFromDraft({ ...draft, triggerKind: "time", afterMin: 0, direction: null, price: null, takeProfitPct: null, stopLossPct: null }, "ETH-USDC");
    expect(render(now.sentence)).toBe("Buy [$3] of [ETH] now.");
    expect(Cartridge.safeParse(dip).success && Cartridge.safeParse(now).success).toBe(true);
  });

  it("never lets a model's direction nonsense through", () => {
    const c = cartridgeFromDraft({ ...draft, direction: "up" }, "ETH-USDC");
    expect(c.trigger).toMatchObject({ direction: "above" });
  });
});

describe("durationLabel", () => {
  it("formats", () => {
    expect([30, 60, 90, 360, 1440, 2880].map(durationLabel)).toEqual(["30m", "1h", "1h 30m", "6h", "1d", "2d"]);
  });
});
