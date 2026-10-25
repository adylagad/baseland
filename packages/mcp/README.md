# @baseland/mcp

The Baseland MCP server (stdio) and a Claude Code skill. They let Claude Code,
or any MCP harness, draft, replay, arm and stop **Plays** on the hosted
engine. A Play created here appears on your iPhone's Dynamic Island, where
you approve it.

**Everything here is GHOST** (simulated). The engine refuses live Plays and
approvals from a harness, so no tool can spend money.

## Install

From the repo root, after `pnpm install`:

```sh
pnpm connect-claude bl_...   # paired with your phone
pnpm connect-claude          # no phone: a private anonymous Ghost account
```

Get the `bl_…` token in the app: **Rig → Account → Claude Code → Connect
Claude Code → Copy command**. The command is copied whole; the token is masked
on screen. The script builds `dist/`, registers the server for your user
(`claude mcp add baseland -s user …`) and copies the skill to
`~/.claude/skills/baseland/`. Restart Claude Code afterwards.

Any other harness: run `node packages/mcp/dist/index.js` over stdio, with
`BASELAND_TOKEN` in its environment for paired mode.

| Env | Default | |
| --- | --- | --- |
| `BASELAND_TOKEN` | none | Harness token from the app. Without it, the server signs in anonymously. |
| `BASELAND_ENGINE_URL` | `https://baseland-engine.onrender.com` | |
| `BASELAND_SESSION_FILE` | `~/.config/baseland/mcp-session.json` | Anonymous session (mode 600). |

## Tools

| Tool | Does |
| --- | --- |
| `whoami` | Paired or anonymous, and the account's Ghost cash |
| `quote` | Live Coinbase price for a product id |
| `draft_play` | Sentence → cartridge (Haiku 5.5 on the engine), not armed |
| `replay_play` | Run a Play on real prices from the last 0.25–7 days (simulated) |
| `create_play` | Arm a Ghost Play from `text` or a `cartridge` |
| `list_plays`, `get_play` | Plays, and one Play with its Tape |
| `control_play` | pause / resume / skip / kill (**no approve**) |
| `kill_all` | The kill switch |

Resources: `baseland://cartridge/schema` (JSON Schema) and
`baseland://cartridge/examples`.

## What a harness token can do

The engine enforces this, not the MCP:

- **Allowed:** create Ghost Plays, list and read Plays, pause / resume /
  skip / kill, kill all, draft, preview and replay, and `/v1/me`.
- **Refused (403):** approving, live Plays, Coinbase credentials, Rig edits,
  the account, and minting or revoking tokens.
- One token per user, stored only as a SHA-256. Making a new one in the app,
  or **Disconnect**, revokes the old one.

## Develop

```sh
pnpm --filter @baseland/mcp test    # tools over an in-memory MCP transport
pnpm --filter @baseland/mcp build
```
