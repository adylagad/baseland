import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { engineClient } from "./engine.js";
import { DEFAULTS, identityFromEnv } from "./identity.js";
import { registerTools } from "./tools.js";

// The Baseland MCP server (stdio). Config, all optional:
//   BASELAND_TOKEN       harness token from the app (Rig → Account); without
//                        it, a private anonymous Ghost account is used
//   BASELAND_ENGINE_URL  defaults to the hosted engine
// stdout carries the protocol, so diagnostics go to stderr only.

const identity = identityFromEnv();
const engine = engineClient({ baseUrl: process.env.BASELAND_ENGINE_URL ?? DEFAULTS.engineUrl, token: identity.token });

const server = new McpServer(
  { name: "baseland", version: "0.1.0" },
  {
    instructions:
      "Baseland runs Plays: short, event-scoped trading missions that live in the iPhone's Dynamic Island. " +
      "Everything this server does is GHOST (simulated, no real money); always call it GHOST to the user. " +
      "Draft or replay a Play before arming it, and show the user its sentence. Only the phone's owner can approve trades.",
  },
);
registerTools(server, engine, identity);

await server.connect(new StdioServerTransport());
console.error(`baseland-mcp: ready (${identity.kind})`);
