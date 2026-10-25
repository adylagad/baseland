# Development timeline

Rolling summary of every context log in `docs/context/`, newest first. Loaded
automatically via `AGENTS.md`, so every session starts knowing what the
project has been through. Keep entries short; detail lives in the logs.

---

## 2026-10-25 — [context](./context/2026-10-25.md)

**Session 3: Figma track artifacts.** Editable product screens, a tested
prototype, and an eight-slide workflow deck are shared from the team's Edu
account. The live prototype is embedded in Slides with a direct link. The
demo video is still open: a simulator attempt found an empty Deck despite a
healthy engine and a successful authenticated Deck API check.

**Session 2: SpacetimeDB core on `feature/spacetime-core`.** Transactional
private Plays/Tape, a public Ghost Arena projection, authenticated iPhone
event relay, and a guarded import script. The module is published on
Maincloud and the merged branch passes TS, cloud integration and iOS build
checks. Render remains on `main`; no source rows were imported.

**Session 1: Phase 6, the Baseland MCP and the Claude Code skill.** Claude
Code can draft, replay, arm and stop **Ghost** Plays that appear on the
user's Island.

- **Harness tokens:** minted in the app (masked on screen), hashed at rest,
  default deny in the engine. Ghost only, **never approve**. Without a token
  the MCP uses an anonymous Ghost account, so judges need no app.
- Verified: a real headless Claude Code session used the skill and tools
  unprompted. The simulator e2e (`scripts/harness-e2e.sh`) shows the Play in
  the app and the Dynamic Island.
- Then: harness tokens added to ARCHITECTURE.md, and the **architecture
  diagram** drawn (`docs/diagrams/`, in the README). Test users deleted by the
  user.
- Open: the feedback write-up, the video and the submission checklist.

## 2026-10-24 — [context](./context/2026-10-24.md)

**Session 8: Phase 5, the Rig, done.** Brain / Senses / Instincts / Hands /
Leash change real behaviour at the next decision (even for running Plays);
plus Replay on real past prices (simulated), Account, and cartridge
share/import. All four UI tests pass (Rig also in dark mode).

- Running it caught Replay contradicting its own chart (now watches the whole
  range) and colliding chart labels.
- **Next: Phase 6** (MCP + skill, submission) in a fresh session; see the
  context log's handoff note.

**Session 7: teammate secrets in Supabase Vault.** `baseland_engine_env`
holds the engine `.env`, written by a service-role-only RPC from a script,
with no secret in chat. **No Coinbase key is shared** (each participant uses
their own). Setup steps are in the root README. `pg_net` moved out of
`public`.

**Session 6: Sonnet 5.5 decides, Haiku 5.5 drafts** (faster: draft 3 s,
Deck 12 s). **Lock-screen approval verified** on an iPhone 16e simulator (no
Dynamic Island, like the user's phone). Testing stays in simulators by the
user's choice.

**Session 5: Phase 3, the iPhone app, built and verified in the simulator.**
Onboarding → Deck (swipe to arm, chip editors, say a Play) → Plays → a
Play's page with the Tape. Live Activities are driven by the engine over
Supabase Realtime.

- **Approving from the Dynamic Island works** (XCUITest via SpringBoard:
  expand, Approve, filled). All intents are `LiveActivityIntent`s so they run
  in the app with its session, with no App Group needed.
- Two UI tests run end to end against the deployed engine and save
  screenshots.
- Still open: the **device** exit check (free-Apple-ID install, keep-alive,
  Control Center, Siri, voice, Face ID).

**Session 4: Phase 2, the agent, done.** Claude decides at each trigger
(rules fallback), drafts Plays from a sentence, and deals a Deck from live
prices. Evidence purchases are **simulated** (option b) at real catalog prices.

- Models write flat Drafts; code builds cartridges, resolves products and
  generates chips (`cartridgeFromDraft`, `sentenceFor`).
- Live bugs fixed: a "wait" verdict re-asked Claude on every tick (now a
  5-min cooldown, 4-decision cap), and creating a Play blocked on the
  decision (now background).
- Defaults are `claude-opus-5-5` per the claude-api skill; AGENTS.md still
  says Sonnet/Haiku (flagged to the user). No stock prices on weekends.

**Session 3: Phase 1, the engine core, done.** A Ghost Play now runs end to
end on live Coinbase prices, locally and on Render.

- `packages/play-schema` (cartridge, no mode inside). Engine: state machine,
  triggers, Leash (+ `LIVE_MAX_ORDER_USD` ceiling), ledger from fills, Play
  store, ticker feed, Ghost/Coinbase gateways, RuleBrain, runtime, routes.
  **Live trading is off by default** (`LIVE_TRADING_ENABLED`).
- **Live exits ride on the Coinbase order** (attached TP/SL); Ghost exits
  are engine-watched.
- Running it found two bugs the tests missed: empty JSON bodies → 400, and
  deleted Plays still in memory. Both fixed.
- iOS target is now **26**. **CI tests the engine and auto-deploys main to
  Render** via a deploy hook secret (verified: push → tests → deploy →
  `/health` shows the commit). `trigger_deploy` is only a fallback.

**Session 2: Phase 0 built and deployed.** Repo public at
`adylagad/baseland`. Engine live at `baseland-engine.onrender.com`. The demo
Play shows in the simulator's real Dynamic Island.

- **Engine:** health, live quotes, and Coinbase key connection, accepted
  only if the key reaches exactly one non-Default portfolio. Encrypted at
  rest. Verified end to end locally and on Render with the real, unfunded,
  scoped key.
- **Sandbox keys are useless** (canned data for any key, no prices, no x402),
  so a production key on an empty portfolio is used. Ghost until Phase 4.
- **Keep-alive is a Supabase pg_cron ping**, not cron-job.org. Pushes don't
  auto-deploy to Render yet: use `trigger_deploy`.
- Traps recorded: a non-Sendable `Activity`, compact Island width, SwiftPM
  `.build/` nearly pushed, and the USDC→USD ticker relabel.

**Session 1: ideation and planning; no code yet.** Read the Coinbase sponsor
brief, researched the competition, picked the idea, and wrote the docs.

- **Idea: Plays.** Short, event-scoped agent missions that live in the Dynamic
  Island (Live Activities), with Approve/Skip from the Island, x402
  pay-per-decision evidence, Ghost (labeled paper) mode, and an advanced
  "Rig" where Brain, Senses, Instincts, Hands and Leash can be swapped. See
  `IDEA.md`.
- **Already shipped elsewhere, so avoided as headlines:** Coinbase Advisor
  (advises, cannot trade), Robinhood Agents and Agent Apps (Loops coming
  soon), Public AI Agents (chat-built rules plus marketplace), and Coinbase's
  planned per-trade and spend caps.
- **Constraints that shaped it:** the remote Coinbase MCP is allowlisted, so
  we use the `coinbase` CLI with a portfolio-scoped CDP key. There is no paid
  Apple account, so no APNs; Realtime plus a keep-alive instead. The
  hackathon is on a weekend, so stock Plays run in Ghost and Replay. Hosting
  is Render free with a ping.
- Team of 2; Claude writes the iOS app and the engine. $20 budget for the
  live crypto trade and x402.
