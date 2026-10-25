import { describe, expect, it } from "vitest";
import { fakeCoinbase, testServer } from "./helpers.js";

const { app } = testServer(fakeCoinbase({ portfolios: [], accessible: [] }));

describe("health and market", () => {
  it("GET /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, version: "dev" });
  });

  it("GET /v1/market/:productId upper-cases and validates the id", async () => {
    const ok = await app.inject({ method: "GET", url: "/v1/market/eth-usdc" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ productId: "ETH-USDC", price: 2353.57 });

    const bad = await app.inject({ method: "GET", url: "/v1/market/not a product" });
    expect(bad.statusCode).toBe(400);
  });
});

describe("me", () => {
  it("reports Ghost cash, connection and the live switch", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: "Bearer token-alice" } });
    expect(res.json()).toEqual({ userId: "alice", ghostCashUsd: 100, coinbase: { connected: false }, liveTradingEnabled: false });
    expect((await app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
  });
});
