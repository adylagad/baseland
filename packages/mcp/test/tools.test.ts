import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { examples } from "@baseland/play-schema";
import { engineClient } from "../src/engine.js";
import { registerTools } from "../src/tools.js";

const play = {
  id: "p1",
  title: "ETH breakout",
  sentence: examples.ethBreakout.sentence,
  spec: examples.ethBreakout,
  mode: "ghost",
  state: "watching",
  stateReason: null,
  pending: null,
  status: { headline: "Watching ETH for $2,400" },
  windowStart: "2026-10-25T18:00:00.000Z",
  windowEnd: "2026-10-26T00:00:00.000Z",
  createdAt: "2026-10-25T18:00:00.000Z",
};

/** A stand-in engine: records requests, answers a few routes. */
function fakeEngine() {
  const calls: { method: string; path: string; body?: any; auth: string | null }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init.method!, path, body, auth: new Headers(init.headers).get("authorization") });
    const ok = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (path === "/v1/plays/draft") return ok({ cartridge: examples.ethBreakout });
    if (path === "/v1/plays" && init.method === "POST") return ok({ ...play, spec: body.cartridge }, 201);
    if (path === "/v1/plays") return ok({ plays: [play, { ...play, id: "p0", state: "done" }] });
    if (path === "/v1/plays/p1") return ok({ play, tape: [{ at: play.createdAt, kind: "state", simulated: true, payload: { from: "armed", to: "watching" } }] });
    if (path === "/v1/plays/p1/approve") return ok({ error: "Only the Baseland app can do this; a harness token can't." }, 403);
    if (path === "/v1/plays/nope/kill") return ok({ error: "No such Play." }, 404);
    if (path === "/v1/replay") {
      return ok({
        simulated: true, product: "ETH-USDC", granularity: "FIVE_MINUTE", from: play.windowStart, to: play.windowEnd,
        fired: true, trigger: { at: play.windowStart, price: 2400 }, entry: { at: play.windowStart, price: 2400, base: 0.00125, feeUsd: 0.03, spentUsd: 3 },
        exit: { at: play.windowEnd, price: 2496, reason: "take_profit", feeUsd: 0.03 }, pnlUsd: 0.06, holding: false,
        series: [{ t: play.windowStart, close: 2390 }, { t: play.windowEnd, close: 2496 }], notes: ["Simulated."],
      });
    }
    return ok({ error: "not found" }, 404);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

async function connect() {
  const fake = fakeEngine();
  const engine = engineClient({ baseUrl: "https://engine.test", token: async () => "bl_test", fetch: fake.fetch });
  const server = new McpServer({ name: "baseland", version: "test" });
  registerTools(server, engine, { kind: "paired", token: async () => "bl_test" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: res.content.map((c) => c.text).join("\n"), isError: res.isError ?? false };
  };
  return { client, call, calls: fake.calls };
}

describe("Baseland MCP tools", () => {
  it("lists the tools, with no approve tool", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["control_play", "create_play", "draft_play", "get_play", "kill_all", "list_plays", "quote", "replay_play", "whoami"]);
    const control = (await client.listTools()).tools.find((t) => t.name === "control_play")!;
    expect(JSON.stringify(control.inputSchema)).not.toContain("approve");
  });

  it("create_play from text drafts, then arms in Ghost with the harness token", async () => {
    const { call, calls } = await connect();
    const res = await call("create_play", { text: "if ETH breaks 2400 buy $3" });
    expect(res.isError).toBe(false);
    expect(res.text).toContain("[GHOST] ETH breakout");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/plays/draft", "POST /v1/plays"]);
    expect(calls[1]!.body).toMatchObject({ mode: "ghost", cartridge: { title: "ETH breakout" } });
    expect(calls.every((c) => c.auth === "Bearer bl_test")).toBe(true);
  });

  it("insists on exactly one source for a Play", async () => {
    const { call, calls } = await connect();
    const res = await call("replay_play", { text: "buy eth", play_id: "p1" });
    expect(res).toMatchObject({ isError: true });
    expect(res.text).toMatch(/exactly one/);
    expect(calls).toHaveLength(0);
  });

  it("list_plays hides finished Plays unless asked", async () => {
    const { call } = await connect();
    expect((await call("list_plays")).text.split("\n")).toHaveLength(1);
    expect((await call("list_plays", { include_finished: true })).text.split("\n")).toHaveLength(2);
  });

  it("get_play shows the Tape, labeled GHOST", async () => {
    const { call } = await connect();
    const res = await call("get_play", { play_id: "p1" });
    expect(res.text).toContain("“If ETH breaks $2,400 in the next 6h, buy $3. Take profit at +4%, stop at −2%.”");
    expect(res.text).toMatch(/GHOST state: armed → watching/);
  });

  it("replay_play of a running Play reads its cartridge and reports a simulated result", async () => {
    const { call, calls } = await connect();
    const res = await call("replay_play", { play_id: "p1", days: 2 });
    expect(calls.at(-1)!.body).toMatchObject({ days: 2, cartridge: { title: "ETH breakout" } });
    expect(res.text).toContain("[GHOST] REPLAY");
    expect(res.text).toContain("Simulated P&L: $0.06");
  });

  it("turns engine errors into tool errors", async () => {
    const { call } = await connect();
    const res = await call("control_play", { play_id: "nope", action: "kill" });
    expect(res).toEqual({ isError: true, text: "Baseland: No such Play." });
  });
});
