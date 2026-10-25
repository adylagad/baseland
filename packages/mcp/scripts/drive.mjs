// Calls the built Baseland MCP server's tools over stdio, as a harness would.
//
//   node packages/mcp/scripts/drive.mjs whoami 'quote={"product_id":"ETH-USDC"}' \
//     'create_play={"text":"buy $2 of ETH now"}' 'control_play={"play_id":"$ID","action":"kill"}'
//
// Each step is `tool` or `tool=<json args>`; "$ID" becomes the last Play id
// seen in a result. BASELAND_TOKEN and the other env vars pass through.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const server = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const transport = new StdioClientTransport({ command: process.execPath, args: [server], env: process.env, stderr: "inherit" });
const client = new Client({ name: "baseland-drive", version: "1" });
await client.connect(transport);

let lastId = "";
let failed = false;
for (const step of process.argv.slice(2)) {
  const [name, raw] = step.split(/=(.*)/s);
  const args = JSON.parse((raw ?? "{}").replaceAll("$ID", lastId));
  const res = await client.callTool({ name, arguments: args });
  const text = res.content.map((c) => c.text).join("\n");
  lastId = text.match(/\(id ([0-9a-f-]{36})\)/)?.[1] ?? lastId;
  failed ||= Boolean(res.isError);
  console.log(`\n### ${name}${res.isError ? " (error)" : ""}\n${text}`);
}
await client.close();
process.exit(failed ? 1 : 0);
