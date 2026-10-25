import { describe, expect, it } from "vitest";
import { examples } from "@baseland/play-schema";
import { fakeCoinbase, testServer } from "./helpers.js";

const alice = { authorization: "Bearer token-alice" };

describe("Rig routes", () => {
  it("GET returns defaults and the catalog; PUT validates and persists", async () => {
    const { app } = testServer(fakeCoinbase({ portfolios: [], accessible: [] }));
    const first = (await app.inject({ method: "GET", url: "/v1/rig", headers: alice })).json();
    expect(first.rig.brain).toEqual({ model: "claude-sonnet-5-5", effort: "medium" });
    expect(first.catalog.senses.find((s: { id: string }) => s.id === "exa.news")).toMatchObject({ priceUsdc: 0.025 });
    expect(first.catalog.models.map((m: { id: string }) => m.id)).toContain("rules");

    const bad = await app.inject({ method: "PUT", url: "/v1/rig", headers: alice, payload: { rig: { brain: { model: "gpt" } } } });
    expect(bad.statusCode).toBe(400);
    const unknownSense = await app.inject({ method: "PUT", url: "/v1/rig", headers: alice, payload: { rig: { senses: { enabled: ["made.up"] } } } });
    expect(unknownSense.json().error).toMatch(/Unknown sense/);

    const put = await app.inject({ method: "PUT", url: "/v1/rig", headers: alice, payload: { rig: { brain: { model: "claude-haiku-5-5", effort: "low" }, hands: { assets: ["BTC", "ETH"] } } } });
    expect(put.json().rig.hands.assets).toEqual(["BTC", "ETH"]);
    const again = (await app.inject({ method: "GET", url: "/v1/rig", headers: alice })).json();
    expect(again.rig.brain).toEqual({ model: "claude-haiku-5-5", effort: "low" });
  });

  it("Account shows Ghost cash and positions derived from fills", async () => {
    const { app, h } = testServer(fakeCoinbase({ portfolios: [], accessible: [] }));
    await h.price("ETH-USDC", 2000);
    const play = await h.create("alice", examples.ethNow, "ghost");
    await h.runtime.approve("alice", play.id);
    await h.price("ETH-USDC", 2100);
    const acct = (await app.inject({ method: "GET", url: "/v1/account", headers: alice })).json();
    expect(acct.live).toBeNull();
    expect(acct.ghost.cashUsd).toBe(98);
    expect(acct.ghost.positions).toHaveLength(1);
    expect(acct.ghost.positions[0]).toMatchObject({ product: "ETH-USDC", symbol: "ETH" });
    expect(acct.ghost.positions[0].avgPrice).toBeCloseTo(2000, 2);
    expect(acct.ghost.positions[0].pnlUsd).toBeGreaterThan(0);
  });

  it("Replay returns a simulated result, and 422 for what it can't do", async () => {
    const { app } = testServer(fakeCoinbase({ portfolios: [], accessible: [] }));
    const ok = await app.inject({ method: "POST", url: "/v1/replay", headers: alice, payload: { cartridge: { ...examples.ethBreakout, window: { lastsMin: 2880 }, trigger: { kind: "price_cross", product: "ETH-USDC", direction: "above", price: 103 } }, days: 2 } });
    expect(ok.json()).toMatchObject({ simulated: true, fired: true });
    const sell = await app.inject({ method: "POST", url: "/v1/replay", headers: alice, payload: { cartridge: { ...examples.ethNow, action: { side: "SELL", product: "ETH-USDC", baseSize: "0.001" }, sentence: [{ kind: "text", text: "sell" }] }, days: 1 } });
    expect(sell.statusCode).toBe(422);
  });
});
