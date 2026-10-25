import { describe, expect, it } from "vitest";
import { examples } from "@baseland/play-schema";
import { hashHarnessToken } from "../src/harness/tokens.js";
import { settle } from "./harness.js";
import { fakeCoinbase, testServer } from "./helpers.js";

const alice = { authorization: "Bearer token-alice" };

async function setup() {
  const s = testServer(fakeCoinbase({ portfolios: [], accessible: [] }));
  await s.h.price("ETH-USDC", 2000);
  const minted = await s.app.inject({ method: "POST", url: "/v1/harness", headers: alice });
  const token: string = minted.json().token;
  return { ...s, minted, mcp: { authorization: `Bearer ${token}` }, token };
}

describe("Harness tokens", () => {
  it("are minted by the app, shown once, stored only as a hash", async () => {
    const { app, minted, token, harnessTokens } = await setup();
    expect(minted.statusCode).toBe(201);
    expect(token).toMatch(/^bl_[A-Za-z0-9_-]{43}$/);
    expect(await harnessTokens.use(hashHarnessToken(token))).toBe("alice");

    const info = await app.inject({ method: "GET", url: "/v1/harness", headers: alice });
    expect(info.json()).toMatchObject({ connected: true });
    expect(JSON.stringify(info.json())).not.toContain(token);
  });

  it("act as the user who minted them, on the same Plays", async () => {
    const { app, mcp } = await setup();
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: mcp });
    expect(me.json()).toMatchObject({ userId: "alice", via: "harness" });

    const created = await app.inject({ method: "POST", url: "/v1/plays", headers: mcp, payload: { cartridge: examples.ethNow } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ mode: "ghost" });
    await settle();

    // The phone sees it, and the person holding the phone approves it.
    const list = await app.inject({ method: "GET", url: "/v1/plays", headers: alice });
    expect(list.json().plays.map((p: { id: string }) => p.id)).toEqual([created.json().id]);
    const id = created.json().id;
    const mcpApprove = await app.inject({ method: "POST", url: `/v1/plays/${id}/approve`, headers: mcp });
    expect(mcpApprove.statusCode).toBe(403);
    const approve = await app.inject({ method: "POST", url: `/v1/plays/${id}/approve`, headers: alice });
    expect(approve.json()).toMatchObject({ state: "done" });
  });

  it("can only create Ghost Plays", async () => {
    const { app, mcp } = await setup();
    const live = await app.inject({ method: "POST", url: "/v1/plays", headers: mcp, payload: { cartridge: examples.ethNow, mode: "live" } });
    expect(live.statusCode).toBe(403);
    expect(live.json().error).toMatch(/Ghost/);
  });

  it("can stop Plays and replay, but nothing else the app can do", async () => {
    const { app, mcp } = await setup();
    const play = (await app.inject({ method: "POST", url: "/v1/plays", headers: mcp, payload: { cartridge: examples.ethBreakout } })).json();
    expect((await app.inject({ method: "POST", url: `/v1/plays/${play.id}/kill`, headers: mcp })).json()).toMatchObject({ state: "killed" });
    expect((await app.inject({ method: "POST", url: "/v1/kill-all", headers: mcp })).statusCode).toBe(200);
    const replay = await app.inject({ method: "POST", url: "/v1/replay", headers: mcp, payload: { cartridge: examples.ethBreakout, days: 1 } });
    expect(replay.statusCode).toBe(200);

    for (const [method, url] of [
      ["GET", "/v1/credentials"],
      ["POST", "/v1/credentials"],
      ["DELETE", "/v1/credentials"],
      ["PUT", "/v1/rig"],
      ["GET", "/v1/account"],
      ["POST", "/v1/harness"],
      ["DELETE", "/v1/harness"],
    ] as const) {
      const res = await app.inject({ method, url, headers: mcp, payload: method === "GET" || method === "DELETE" ? undefined : {} });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it("stop working once revoked or replaced", async () => {
    const { app, mcp } = await setup();
    await app.inject({ method: "POST", url: "/v1/harness", headers: alice });
    expect((await app.inject({ method: "GET", url: "/v1/plays", headers: mcp })).statusCode).toBe(401);

    const fresh = (await app.inject({ method: "POST", url: "/v1/harness", headers: alice })).json().token;
    const freshAuth = { authorization: `Bearer ${fresh}` };
    expect((await app.inject({ method: "GET", url: "/v1/plays", headers: freshAuth })).statusCode).toBe(200);
    await app.inject({ method: "DELETE", url: "/v1/harness", headers: alice });
    expect((await app.inject({ method: "GET", url: "/v1/plays", headers: freshAuth })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/harness", headers: alice })).json()).toEqual({ connected: false });
  });

  it("unknown harness tokens are rejected", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/plays", headers: { authorization: "Bearer bl_nope" } });
    expect(res.statusCode).toBe(401);
  });
});
