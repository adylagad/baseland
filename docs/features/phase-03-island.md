# Phase 03 — Island (the iPhone app, Basic mode)

Features shipped while building the app (see `docs/PLAN.md`, Phase 3).
Newest first. Append only.

---

## Approve from the Dynamic Island (and the lock screen)

**What it does:** while a Play is **awaiting**, its expanded Island and
lock-screen card show **Skip** and **Approve $N**. Tapping either acts on
the Play without opening the app. While a Play is armed or watching, they
show **Pause**. Orders above **$25** (`IslandLimits.approvalUSD`) show
"Open Baseland to approve" instead, and the app asks for Face ID. Tapping the
activity anywhere else opens the Play (`baseland://play/<id>`).

**How:** the buttons are `LiveActivityIntent`s (`Shared/PlayIntents.swift`,
compiled into app and widget). iOS runs them in the app's process, waking it
in the background, so they use the app's signed-in session. No App Group
is needed. The app installs `IntentBridge.handler` at launch.

**Verified (2026-10-24):** XCUITest `IslandApprovalTests`: a Ghost Play
asks → SpringBoard long-press expands the real simulator Island ("YOUR CALL ·
Buy ETH now · ETH flat near $2,363, nothing unusual. Buy $2 of ETH? · Skip |
Approve $2") → tap Approve → the Play fills ("Bought 0.00083884 ETH at
$2,362.79") with the app in the background. **Not yet seen on a real iPhone.**

## Kill switch: in the app, Control Center, Siri

The Plays toolbar has **Stop all** (with a confirmation). A Control Center
control (`KillSwitchControl`) and the App Shortcut "Pause everything in
Baseland" / "Stop all Baseland Plays" run `KillAllIntent` → `POST
/v1/kill-all`. **Verified:** the in-app button calls the engine route, which
is unit-tested. **Unverified:** Control Center and Siri (built; need a device).

## The Deck (swipe to arm)

**What it does:** home is a stack of Play cards from `GET /v1/deck`. Each
card shows the asset, the kind (Breakout / Dip / Jump / Now / Timed), the
title, the chip sentence, the agent's one-line rationale, and the Leash,
evidence budget and approval policy. **Swipe right** (or ✓) arms it in
Ghost; **swipe left** (or ✕) skips it. An empty Deck shows "Writing your Deck
from live prices…" and then offers a fresh deal. The header shows Ghost cash.

**Chips:** tapping a chip opens an editor matched to its field: amount ($1–25
slider plus presets), percentages, price level (±10% around the current
level), durations, or the asset (which moves trigger, action and Leash
together). The edited cartridge goes to `/v1/cartridges/preview`; the engine
validates it and returns the rewritten sentence. Punctuation after a chip
stays glued to it.

**Composer:** "Say a Play…" takes typed text or hold-to-talk speech (on-device
recognition) and sends it to `/v1/plays/draft`. The result lands on top of
the Deck marked "Your words".

**Verified:** XCUITest `BaselandFlowTests` against the deployed engine:
onboarding → Deck (Claude-written cards) → chip editor → typed sentence →
"Buy [$3] of [ETH] now." card → swipe right → armed. Screenshots reviewed.
**Voice is unverified** (simulator microphone).

## Plays and the Tape

**Plays** lists Running and Finished Plays: stage dot, title, GHOST badge,
headline, and the pending amount ("$3.00? Your call") or P&L (hidden while
it would read $0.00). The tab badge counts Plays waiting for you. A **Play's
page** shows the stage pill, countdown, chip sentence, headline, progress,
price and P&L. While awaiting it shows the approval panel (Skip / Approve,
Face ID above $25), plus Pause / Resume / Stop, total evidence spend, and
**the Tape** as a timeline: state changes, triggers, evidence receipts with
cost, Claude's verdict and reasons, approvals, previews, orders and fills
(price, size, fee), GHOST-labelled on every simulated row.

**Verified:** the UI test approved a Play from its page and read its Tape;
the screenshots show the full story of the run.

## Live Activity driven by the engine

`ActivitySync` keeps one Live Activity per running Play, built from Realtime
row changes (`plays` and `tape`, filtered to the user, through RLS), and
re-sends only when the content changes. Terminal Plays end their activity,
leaving the result on the lock screen for 5 minutes. **KeepAlive** (silent,
mixable background audio while any Play is live) is the hackathon-only
substitute for APNs. **Verified:** in the simulator, the Island showed
"● ETH $3.00?" from the real engine within seconds of the decision.
**Unverified on a device:** background updates over time, and the keep-alive.

## Onboarding and session

One tap, **Start in Ghost**: an anonymous Supabase user, with "Real prices,
pretend money. Every simulated action is labeled." Coinbase is connected
later in Settings (paste the CDP key file). A stored session the engine
rejects (401) sends the app back to onboarding. **Verified:** the onboarding
screenshot, and Ghost start in both UI tests.

## Claude decides at the trigger (Sonnet 5.5) and drafts (Haiku 5.5)

Extends phase-02 "Claude decides at the trigger" and "Drafting Plays from
words" / "The Play Deck". Restated in full:

When a Play's trigger fires, `ClaudeBrain` is asked **once**, now on
**`claude-sonnet-5-5`** (effort `medium`, server-side refusal fallbacks
`"default"`). Its tools are `market_context` (free live Coinbase stats),
`buy_evidence` (one purchase from the Play's Senses, refused in code beyond
the remaining budget; simulated for now) and `submit_decision` (verdict act /
skip / wait, a headline of at most 90 characters, quoteUsd, reasons). It
never sees order tools. The runtime caps the amount, then the Leash and
approval policy apply. After a "wait", there is no new decision for 5
minutes, and 4 waits end the Play. Any failure falls back to the rules Brain.

Drafting from a sentence and dealing the Deck now run on
**`claude-haiku-5-5`** (effort `low`, structured outputs, **no** fallbacks
parameter: Haiku 5.5 has no server-side refusal fallback, so
`fallbackOptions()` omits it). The models write Drafts only; code resolves
products and builds cartridges and chips.

Both are overridable with `BRAIN_MODEL` / `DRAFT_MODEL`
(`src/brain/models.ts`). The user chose Sonnet/Haiku over the Opus 5.5
default on 2026-10-24.

**Verified (2026-10-24), live:** draft in 3.0 s (6.7 s on Opus), Deck in
12.3 s (17 s), Sonnet decision in 14 s (skip, with reasons). 97 engine tests.
