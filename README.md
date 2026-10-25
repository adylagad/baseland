# Baseland

**Every market event becomes a Play.** Baseland is an iOS app whose trading
agent runs short, event-scoped missions inside your Dynamic Island. It buys
the evidence it needs over x402 for a few cents and asks you to approve with
a long-press. It works across crypto and US stocks on Coinbase.

Built for the CalHacks 2026 Coinbase prompt, **Trading Agents** track.

- The product: [`docs/IDEA.md`](docs/IDEA.md)
- How it works: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Build plan: [`docs/PLAN.md`](docs/PLAN.md)

> **Status:** Phases 0–3 and 5 built, plus the MCP: engine live at
> `https://baseland-engine.onrender.com` (CI-deployed), iPhone app verified in
> the simulator, including approving from the Dynamic Island and the lock
> screen. Real-money trading (Phase 4) is switched off; everything runs in
> GHOST.

## How one Play runs

![Baseland architecture: the app or Claude Code arms a Play; plain-code watchers fire the trigger; Claude returns a decision only; you approve from the Island; the Leash previews and places the order](docs/diagrams/architecture.png)

Source: [`docs/diagrams/architecture.svg`](docs/diagrams/architecture.svg),
drawn by `python3 -I docs/diagrams/architecture.py`. Decisions and limits:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Layout

| Path | What |
| --- | --- |
| `apps/ios` | SwiftUI app, Live Activity / Dynamic Island, App Intents |
| `apps/engine` | Hosted TypeScript engine: Play runtime, watchers, agent, Coinbase CLI gateway |
| `packages/play-schema` | The Play cartridge format |
| `packages/mcp` | Baseland MCP server and Claude Code skill |
| `supabase` | Database migrations |

## Safety

Simulated (GHOST) actions are labeled everywhere. Each user connects their own
Coinbase API key scoped to a dedicated portfolio; keys stay in the engine.
The AI model never holds order-placing tools; the engine enforces hard limits
and previews every order.

## Try it

Both paths use the hosted engine and need no keys. Everything runs in
GHOST (simulated).

**From Claude Code (no iPhone needed).** Node 22+ and pnpm:

```sh
git clone https://github.com/adylagad/baseland && cd baseland
pnpm install
pnpm connect-claude   # registers the Baseland MCP + skill for your user
```

Restart Claude Code and ask: *"Draft a Baseland Play: if ETH drops 2% in the
next 6 hours, buy $5, take profit at 3%. Replay it over 3 days, then arm it."*
Without the app, Plays run on a private anonymous Ghost account. Tools and
limits: [`packages/mcp/README.md`](packages/mcp/README.md).

**The iPhone app, from source.** Xcode 26 and
[XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`):

```sh
cd apps/ios && xcodegen && open Baseland.xcodeproj
```

Run on an iOS 26 simulator (verified), or on your iPhone: pick your
**Personal Team** under Signing for the Baseland and BaselandWidgets targets.
A free Apple ID is the intended path but hasn't been tried on a device yet;
free-account installs expire after 7 days. To see Claude Code's
Plays on your phone, go to **Rig → Account → Claude Code → Connect**, then run
the copied `pnpm connect-claude bl_…` in the repo.

## Getting started (teammates)

1. **Access.** Ask the owner for: GitHub collaborator access to
   `adylagad/baseland`, and an invite to the Supabase organization (Dashboard
   → Organization settings → Team). Render access is optional; CI deploys
   `main` when the engine's tests pass.
2. **Secrets, from Supabase Vault.** In the Supabase dashboard → SQL Editor:

   ```sql
   select decrypted_secret from vault.decrypted_secrets where name = 'baseland_engine_env';
   ```

   Save the result as `apps/engine/.env` (gitignored; never commit it). It
   holds the Anthropic key, the Supabase service-role key and the
   credentials secret. The credentials secret must match the deployed
   engine's, so every engine can decrypt stored Coinbase keys.
3. **Engine.** `pnpm install`, then `pnpm -r test` and `pnpm --filter
   @baseland/engine dev` (http://localhost:8787).
4. **iPhone app.** `cd apps/ios && xcodegen`, open `Baseland.xcodeproj`, run
   on the iPhone 17 simulator. Add the launch argument `-BaselandEngineURL
   http://localhost:8787` to use your local engine. UI tests:
   `apps/ios/README.md`.
5. **Claude Code (optional).** Add the Supabase MCP as in
   `docs/personal-guide/supabase.md`, and the Render MCP with your **own**
   Render API key.
6. **Before changing anything, read `AGENTS.md`.** It covers the money and
   credential rules, how to log sessions, and how to commit.

**Coinbase:** the shared secrets contain **no Coinbase key**. Ghost needs
none. For live work, create your own key scoped to your own dedicated
portfolio (`docs/personal-guide/coinbase-api-key.md`); the sponsor rules
require each participant's own verified account.

**Rotating a secret:** update `apps/engine/.env`, run `python3 -I
scripts/share-secrets.py` (stores it in Vault; prints nothing secret), and
update the same value in Render.
