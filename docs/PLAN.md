# Implementation plan

The build order for the hackathon. Phases are ordered so that **something
demoable exists at the end of every phase** — if time runs out, we stop at a
phase boundary and still have a story.

Delete this file once every phase is done (a plan describing finished work
reads as outstanding); move anything left over into the backlogs first.

Team of two; Claude writes both sides. Rough ownership if the humans split:
**A = iOS**, **B = engine**.

Deadline: _fill in the CalHacks submission time_.

---

## Phase 0 — Foundations

Goal: every moving part exists, talks to its neighbour, and is verified.

- [ ] Monorepo skeleton: `apps/ios`, `apps/engine`, `packages/play-schema`,
      `packages/mcp`, `supabase/`. pnpm workspace for the TS side.
- [x] Git repo `adylagad/baseland`, first push.
- [x] Supabase project; migration for `profiles`, `credentials`, `plays`,
      `tape`, `deck_cards` with owner-only RLS; Realtime on `plays`, `tape`.
- [x] Engine: Fastify `/health`, Supabase JWT verification, Dockerfile.
- [x] Engine deployed to Render; keep-alive ping configured.
- [x] Coinbase gateway smoke test: `portfolios list`, `balance`,
      `products get ETH-USDC`, `x402 resources` — read-only, against the
      dedicated Baseland portfolio key.
- [ ] iOS: XcodeGen project (`Baseland` app + `BaselandWidgets` extension +
      `BaselandKit` local package), builds for simulator and the user's iPhone
      with a free Apple ID.
- [x] A hard-coded Live Activity shows in the simulator's Dynamic Island.

**Exit check:** simulator shows a fake Play in the Dynamic Island; engine on
Render returns live ETH price from the CLI.

## Phase 1 — Engine core (no AI yet)

- [x] `packages/play-schema`: zod schema + TS types for cartridges; JSON
      Schema export for Swift/MCP.
- [x] Play state machine (Armed → Watching → Deciding → Awaiting → Executed →
      Done; Paused / Killed / Expired) with unit tests for every transition.
- [x] Scheduler + rehydrate-on-boot from Supabase.
- [x] Price watcher on Coinbase's public ticker WebSocket; triggers:
      `price_cross`, `pct_move`, `time`.
- [x] `TradingGateway` interface; `GhostGateway` (simulated fills) and
      `CoinbaseGateway` (CLI: preview → create → poll status).
- [x] Leash enforcer with unit tests (max order, max per Play, allowed assets,
      evidence budget, approval threshold). Rejections go to the Tape.
- [x] Tape writer; every Ghost event `simulated: true`.
- [x] API: create / arm / pause / kill / approve / skip / kill-all.

**Exit check:** a Ghost Play created via curl fires on a price cross, waits for
approval, fills, writes a full Tape. Tests green.

## Phase 2 — The agent

- [x] Brain interface + Claude implementation (structured decision output).
- [x] Evidence tools: x402 discover/fetch with per-Play budget enforced by the
      engine; receipts to the Tape. At least two providers working.
- [x] Decision step wired into the runtime at `Deciding`.
- [x] Sentence → chips → cartridge parser (Haiku).
- [x] Deck generator: suggested Plays from holdings + a seeded event calendar.
- [x] Instincts as prompt modules.

**Exit check:** a Ghost Play's decision cites x402 evidence with receipts;
"buy five bucks of ETH if it breaks 4k" becomes a valid cartridge.

## Phase 3 — iOS Basic ("Island")

- [x] Design tokens (`Theme.swift`) and core components: Play card, chip,
      stage dot, GHOST treatment.
- [x] Onboarding: Ghost (no key) or Connect Coinbase (paste/scan key).
- [x] Supabase auth (anonymous or email OTP — no Sign in with Apple without a
      paid account).
- [x] Play Deck with swipe to arm / skip.
- [ ] Chip-sentence editor + voice input → parser.
- [x] Play detail with the Tape and receipts.
- [ ] Live Activity: lock screen, compact, minimal, expanded; driven by
      Realtime; background keep-alive while a Play is live.
- [x] `LiveActivityIntent`s: Approve / Skip / Pause from the Island, with the
      approval-threshold rule.
- [ ] Kill switch: in-app, Control Center control, Siri App Shortcut.

**Exit check:** on the real iPhone, arm a Ghost Play, lock the phone, approve
from the Island, see the fill in the Tape.

## Phase 4 — Live money

- [ ] Live mode end to end against the Baseland portfolio (~$15 funded).
- [ ] One real ETH or BTC order of ~$2–5 placed via Island approval.
- [ ] x402 paid from the real USDC balance; receipts match Coinbase.

**Exit check:** real fill visible in Coinbase and in the Tape.

## Phase 5 — Advanced ("The Rig")

- [x] Rig screens: Brain, Senses, Instincts, Hands, Leash.
- [x] Account: portfolios, balances, positions, open orders, fees.
- [x] Replay a Play against historical data (crypto candles from Coinbase;
      stocks via Massive over x402). Always GHOST.
- [x] Cartridge export / import.

## Phase 6 — Reuse and submission

- [ ] `packages/mcp`: Baseland MCP server (create / list / replay / kill
      Plays) + a Claude Code skill.
- [ ] README: install paths (MCP/skill; build iOS from source).
- [ ] Architecture diagram for the submission.
- [ ] `builder-feedback.md` → submission's builder feedback section.
- [ ] Demo video (record the Island on the device as a backup).
- [ ] Walk `submission-checklist.md` to the end.

## Cut order if time runs short

Last in, first out: other model providers → cartridge sharing → Replay for
stocks → Rig Account screen → Siri → voice input. **Never cut:** Ghost
labeling, the Leash, Island approval, the Tape.
