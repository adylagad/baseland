import { describe, expect, it } from "vitest";
import { examples } from "@baseland/play-schema";
import { fakeCoinbase, testServer } from "./helpers.js";

const alice = { authorization: "Bearer token-alice" };
const bob = { authorization: "Bearer token-bob" };

async function setup() {
  const s = testServer(fakeCoinbase({ portfolios: [], accessible: [] }));
  await s.h.price("ETH-USDC", 2000);
  return s;
}

describe("Play routes", () => {
  it("require a user", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/v1/plays" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/kill-all" })).statusCode).toBe(401);
  });

  it("create (Ghost by default) → approve → read with Tape", async () => {
    const { app } = await setup();
    const created = await app.inject({ method: "POST", url: "/v1/plays", headers: alice, payload: { cartridge: examples.ethNow } });
    expect(created.statusCode).toBe(201);
    const play = created.json();
    expect(play).toMatchObject({ mode: "ghost", state: "awaiting", title: "Buy ETH now" });

    const approved = await app.inject({ method: "POST", url: `/v1/plays/${play.id}/approve`, headers: alice });
    expect(approved.json()).toMatchObject({ state: "done" });

    const read = await app.inject({ method: "GET", url: `/v1/plays/${play.id}`, headers: alice });
    expect(read.json().tape.map((t: { kind: string }) => t.kind)).toContain("fill");

    const list = await app.inject({ method: "GET", url: "/v1/plays", headers: alice });
    expect(list.json().plays).toHaveLength(1);
  });

  it("maps errors to status codes", async () => {
    const { app } = await setup();
    const bad = await app.inject({ method: "POST", url: "/v1/plays", headers: alice, payload: { cartridge: { version: 1 } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details.length).toBeGreaterThan(0);

    const live = await app.inject({ method: "POST", url: "/v1/plays", headers: alice, payload: { cartridge: examples.ethNow, mode: "live" } });
    expect(live.statusCode).toBe(403);

    const play = (await app.inject({ method: "POST", url: "/v1/plays", headers: alice, payload: { cartridge: examples.ethNow } })).json();
    expect((await app.inject({ method: "POST", url: `/v1/plays/${play.id}/approve`, headers: bob })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/v1/plays/${play.id}/resume`, headers: alice })).statusCode).toBe(409);
  });

  it("kill-all", async () => {
    const { app } = await setup();
    await app.inject({ method: "POST", url: "/v1/plays", headers: alice, payload: { cartridge: examples.ethNow } });
    expect((await app.inject({ method: "POST", url: "/v1/kill-all", headers: alice })).json()).toEqual({ stopped: 1 });
  });
});
