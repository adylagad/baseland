# Phase 06 — Reuse and submission

Features shipped while building Phase 6 (see `docs/PLAN.md`). Newest first.
Append only.

---

## Connect Claude Code from the app

**What it does:** **Rig → Account → Claude Code** shows whether a harness is
connected and when its token was last used. **Connect Claude Code** (later
**Make a new token**) mints a token through `POST /v1/harness` and shows the
command `pnpm connect-claude bl_…` once. **The token is masked on screen**
(`bl_••••••••` plus its last 4), so it never lands in a screenshot or a
recording. **Copy command** and **Send to your Mac** (share sheet) carry the
real one. **Disconnect** revokes it. Minting again revokes the previous token.

**Where:** `apps/ios/App/Views/HarnessView.swift`, `EngineAPI.harness*`,
engine `routes/harness.ts` (app only: a harness token gets 403 there).

**Verified (2026-10-25), on the iPhone 17 simulator against the deployed
engine:** `scripts/harness-e2e.sh` runs `HarnessTests`. The app mints a
token and copies the command. The script reads it from the simulator
clipboard (`simctl pbpaste`; never printed) and has the MCP create a Ghost
Play. The app then shows it in Plays as **From Claude Code · GHOST · Your
call**, in the **Dynamic Island** (`ETH $2.00?`), and the Claude Code screen
reads **Last used: 14 seconds ago**. Passed twice in a row after fixing the
test (see code traps). The test skips unless `TEST_RUNNER_HARNESS=1`.
`RigTests` still passes.

**Not verified:** on a device; "Send to your Mac" (the share sheet) wasn't
driven by a test.

## Baseland MCP server and Claude Code skill

**What it does:** `packages/mcp` is a stdio MCP server that gives any harness
(Claude Code first) nine tools over the engine's API: `whoami`, `quote`,
`draft_play`, `replay_play`, `create_play`, `list_plays`, `get_play`,
`control_play` (pause / resume / skip / kill) and `kill_all`, plus the
cartridge JSON Schema and examples as resources. The skill
(`packages/mcp/skill/baseland/SKILL.md`) sets the workflow: check identity,
draft, read the sentence back, replay, arm, follow up. It also sets the
rules: always say GHOST, never try to approve, never invent product ids.

**Who it acts as:**
- **Paired** (`BASELAND_TOKEN=bl_…`): the user's own account, so Plays appear
  on their Island.
- **Anonymous** (no token): signs in to Supabase anonymously with the public
  key and keeps the session in `~/.config/baseland/mcp-session.json` (mode
  600). This lets judges try it without the app.

**Rules (enforced by the engine, not the MCP):** a harness token opens only
routes marked `config.harness` (default deny, 403 elsewhere). It can create
Ghost Plays only (`mode: "live"` → 403) and can never approve. The MCP has no
approve tool, and its Plays always say `[GHOST]`. Tokens: one per user, only
a SHA-256 stored (`harness_tokens`, RLS on with no policy), revoked by
minting a new one or `DELETE /v1/harness`. A revoked token gets a message
saying how to reconnect.

**Install:** `pnpm connect-claude [bl_…]` builds `dist/`, runs `claude mcp add
baseland -s user`, and copies the skill to `~/.claude/skills/baseland/`.

**Verified (2026-10-25):**
- 6 engine route tests on the token boundary (allowed routes, 403s, Ghost
  only, revoke / replace, unknown token) and 7 MCP tool tests over an
  in-memory transport.
- The built server, driven over stdio against the deployed engine
  (`a3e65a5`), anonymous: quote, a 2-day replay on real ETH prices (fired,
  stopped out, −$0.14 simulated), create, list, Tape, kill. `approve` was
  rejected by the tool schema.
- **A real headless Claude Code session** (`claude -p`, Sonnet, the skill plus
  this server only) took "if BTC drops 2% … replay 3 days, arm it" and on its
  own called the skill, whoami, draft, replay, create and list. Its answer
  labelled everything GHOST and noted that an unpaired Play has nobody to
  approve it.
- `connect-claude.sh` was run against a throwaway HOME: server registered
  (`claude mcp get` showed it connected), skill copied, a non-`bl_` token
  refused.

**Not verified:** harnesses other than Claude Code.
