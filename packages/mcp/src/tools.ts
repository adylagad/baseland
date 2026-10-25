import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { examples } from "@baseland/play-schema";
import cartridgeSchema from "../../play-schema/play.schema.json" with { type: "json" };
import { EngineError, type Engine } from "./engine.js";
import { isFinished, playDetail, playLine, replayText, sentenceText, tapeLines, type Play, type Replay, type TapeRow } from "./format.js";
import type { Identity } from "./identity.js";

// The Baseland tools. Everything here is Ghost: the engine refuses live Plays
// and approvals from a harness, so no tool can spend money. The model authors
// and stops Plays; the person holding the phone approves them.

type Cartridge = Record<string, unknown>;
type Text = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (...parts: string[]): Text => ({ content: [{ type: "text", text: parts.filter(Boolean).join("\n\n") }] });
const json = (label: string, value: unknown) => `${label}:\n${JSON.stringify(value, null, 2)}`;

/** Runs a tool body, turning engine errors into readable tool errors. */
async function guard(fn: () => Promise<Text>): Promise<Text> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const details = err instanceof EngineError && err.details ? `\n${JSON.stringify(err.details, null, 2)}` : "";
    return { content: [{ type: "text", text: `Baseland: ${msg}${details}` }], isError: true };
  }
}

const cartridgeArg = z
  .record(z.string(), z.unknown())
  .describe("A Play cartridge (version 1). Easiest: get one from draft_play and edit it. Full shape: resource baseland://cartridge/schema.");

export function registerTools(server: McpServer, engine: Engine, identity: Identity) {
  const draft = async (sentence: string) => (await engine.post<{ cartridge: Cartridge }>("/v1/plays/draft", { text: sentence })).cartridge;
  const chosen = async (a: { cartridge?: Cartridge; text?: string; play_id?: string }): Promise<Cartridge> => {
    const given = [a.cartridge, a.text, a.play_id].filter((x) => x !== undefined).length;
    if (given !== 1) throw new Error("Pass exactly one of cartridge, text or play_id.");
    if (a.cartridge) return a.cartridge;
    if (a.text) return draft(a.text);
    return (await engine.get<{ play: Play }>(`/v1/plays/${a.play_id}`)).play.spec as Cartridge;
  };

  server.registerTool(
    "whoami",
    {
      title: "Baseland account",
      description: "Which Baseland account this server acts for (paired to a phone, or a private anonymous Ghost account) and its Ghost cash.",
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const me = await engine.get<{ userId: string; ghostCashUsd: number; liveTradingEnabled: boolean }>("/v1/me");
        const who =
          identity.kind === "paired"
            ? "Paired with a Baseland app: Plays you create appear on that phone's Island, and its owner approves them there."
            : "Anonymous Ghost account (no BASELAND_TOKEN set): Plays run on the engine but appear on no phone.";
        return text(who, `Ghost cash: $${me.ghostCashUsd.toFixed(2)} (simulated). Plays created here are always GHOST.`);
      }),
  );

  server.registerTool(
    "quote",
    {
      title: "Live price",
      description: "Current Coinbase price for a product id such as ETH-USDC or BTC-USDC.",
      inputSchema: { product_id: z.string().describe("e.g. ETH-USDC") },
      annotations: { readOnlyHint: true },
    },
    ({ product_id }) =>
      guard(async () => {
        const q = await engine.get<{ productId: string; price: number; change24hPct: number | null; at: string }>(
          `/v1/market/${encodeURIComponent(product_id)}`,
        );
        const change = q.change24hPct === null ? "" : `, ${q.change24hPct >= 0 ? "+" : ""}${q.change24hPct.toFixed(2)}% in 24h`;
        return text(`${q.productId}: $${q.price}${change} (at ${q.at})`);
      }),
  );

  server.registerTool(
    "draft_play",
    {
      title: "Draft a Play",
      description:
        "Turn a sentence (\"if ETH breaks 2,400 in the next 6h, buy $3, take profit at 4%\") into a Play cartridge, without arming it. " +
        "Show the user the sentence, then create_play or replay_play with the cartridge.",
      inputSchema: { text: z.string().min(2).max(500) },
      annotations: { readOnlyHint: true },
    },
    ({ text: sentence }) =>
      guard(async () => {
        const c = await draft(sentence);
        return text(`Draft: “${sentenceText(c.sentence as never)}”`, json("Cartridge", c));
      }),
  );

  server.registerTool(
    "create_play",
    {
      title: "Arm a Ghost Play",
      description:
        "Arm a Play in GHOST mode (simulated; no real money). It appears on the paired phone's Island and its owner approves it there. " +
        "Pass `text` to draft and arm in one step, or a `cartridge` (from draft_play, possibly edited).",
      inputSchema: { cartridge: cartridgeArg.optional(), text: z.string().min(2).max(500).optional() },
    },
    (args) =>
      guard(async () => {
        const cartridge = await chosen(args);
        const play = await engine.post<Play>("/v1/plays", { cartridge, mode: "ghost" });
        return text(`Armed a GHOST Play.`, playDetail(play));
      }),
  );

  server.registerTool(
    "list_plays",
    {
      title: "List Plays",
      description: "This account's Plays, newest first. Running ones only unless include_finished is true.",
      inputSchema: { include_finished: z.boolean().default(false) },
      annotations: { readOnlyHint: true },
    },
    ({ include_finished }) =>
      guard(async () => {
        const { plays } = await engine.get<{ plays: Play[] }>("/v1/plays");
        const shown = include_finished ? plays : plays.filter((p) => !isFinished(p));
        if (shown.length === 0) return text(include_finished ? "No Plays yet." : "No running Plays.");
        return text(shown.map(playLine).join("\n"));
      }),
  );

  server.registerTool(
    "get_play",
    {
      title: "Read a Play and its Tape",
      description: "One Play with its Tape: everything the agent saw, bought, decided and did.",
      inputSchema: { play_id: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ play_id }) =>
      guard(async () => {
        const { play, tape } = await engine.get<{ play: Play; tape: TapeRow[] }>(`/v1/plays/${encodeURIComponent(play_id)}`);
        return text(playDetail(play), `Tape:\n${tapeLines(tape)}`);
      }),
  );

  server.registerTool(
    "replay_play",
    {
      title: "Replay on past prices",
      description:
        "Run a Play against real Coinbase prices from the last `days` days, as if armed at the start. Always simulated; nothing is armed. " +
        "Pass exactly one of `text`, `cartridge` or `play_id`. Buying Plays only.",
      inputSchema: {
        text: z.string().min(2).max(500).optional(),
        cartridge: cartridgeArg.optional(),
        play_id: z.string().optional(),
        days: z.number().min(0.25).max(7).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    ({ days, ...args }) =>
      guard(async () => {
        const cartridge = await chosen(args);
        const r = await engine.post<Replay>("/v1/replay", { cartridge, days });
        return text(`“${sentenceText(cartridge.sentence as never)}”`, replayText(r));
      }),
  );

  server.registerTool(
    "control_play",
    {
      title: "Pause, resume, skip or stop a Play",
      description:
        "pause / resume a watching Play, skip a pending approval (decline it), or kill (stop) a Play. Approving is not possible here; only the phone can.",
      inputSchema: { play_id: z.string(), action: z.enum(["pause", "resume", "skip", "kill"]) },
      annotations: { destructiveHint: true },
    },
    ({ play_id, action }) =>
      guard(async () => {
        const play = await engine.post<Play>(`/v1/plays/${encodeURIComponent(play_id)}/${action}`);
        return text(playLine(play));
      }),
  );

  server.registerTool(
    "kill_all",
    {
      title: "Kill switch",
      description: "Stop every running Play on this account at once.",
      inputSchema: {},
      annotations: { destructiveHint: true },
    },
    () =>
      guard(async () => {
        const { stopped } = await engine.post<{ stopped: number }>("/v1/kill-all");
        return text(`Kill switch: stopped ${stopped} Play${stopped === 1 ? "" : "s"}.`);
      }),
  );

  server.registerResource(
    "cartridge-schema",
    "baseland://cartridge/schema",
    { title: "Play cartridge JSON Schema", mimeType: "application/schema+json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/schema+json", text: JSON.stringify(cartridgeSchema, null, 2) }] }),
  );
  server.registerResource(
    "cartridge-examples",
    "baseland://cartridge/examples",
    { title: "Example Play cartridges", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(examples, null, 2) }] }),
  );
}
