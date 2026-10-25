# Phase 05 — The Rig (advanced mode)

Features shipped while building the Rig (see `docs/PLAN.md`, Phase 5).
Newest first. Append only.

---

## The Rig: a plug-and-play agent

**What it does:** one validated document per user (`profiles.rig`; schema
`Rig` in `@baseland/play-schema`), edited in the app's **Rig** tab. Every
edit is saved to the engine at once (`PUT /v1/rig`, put back on failure)
and applied **at the next decision, including for running Plays**:

- **Brain:** model (Sonnet 5.5 default, Opus 5.5, Haiku 5.5, or *Rules
  only*) and effort (Quick / Balanced / Careful). The engine builds and caches
  a Brain per model and effort, always with the rules fallback.
- **Senses:** which x402 sources the agent may buy from (9, with real catalog
  prices; purchases simulated until funded) and the budget given to new
  Plays. **A Sense switched off stops purchases even for running Plays**
  (the runtime intersects a Play's Senses with the Rig's).
- **Instincts:** the user's own wording for steady / momentum / contrarian /
  hedger (up to 600 characters), passed to the Brain instead of the built-in
  text. Can be reset to the built-in text.
- **Hands:** the assets the agent may buy (exits always pass, so a position
  can close) and the approval policy for new Plays (always / above $10 /
  never). Drafts and Deck cards only use these assets; a draft outside Hands
  is refused with the reason.
- **Leash:** global caps (max per order $10, per Play $25, evidence per Play
  $0.25 by default) applied on top of every Play's own Leash. Drafts clamp
  amounts to them.

**Where:** engine `src/rig/store.ts`, `src/plays/runtime.ts` (rig(),
leash(), evidenceHandle()), `src/brain/drafter.ts`, `src/routes/rig.ts`
(`GET/PUT /v1/rig` with a catalog of models, Senses, instincts, assets);
app `App/Views/RigView.swift`.

**Verified (2026-10-24):** engine tests per slot (Leash caps, Hands,
Brain choice + instinct wording, Senses filtering), Rig schema tests, and
route tests. **Live:** SOL refused when Hands were BTC/ETH; "buy 50 dollars
of eth" drafted as $10. **UI test** `RigTests`: Haiku chosen, Nansen
switched off, relaunch → both read back from the engine. Light and dark.

## Replay: a Play against real past prices

**What it does:** `POST /v1/replay { cartridge, days: 0.25–7 }` runs a buying
Play over Coinbase's public candles (5-minute ≤1 day, 15-minute ≤3 days,
hourly ≤7 days; under the 350-candle cap). It assumes the agent acted on the
first trigger (no Claude call), checks the trigger intrabar, fills at the
trigger level with the 0.9% fee inside the spend, and exits at the
take-profit or stop-loss level (stop first if both fall in one candle), or
marks the position to the last price. **It watches the whole range on the
chart** and notes how long the Play stays open when armed for real. **Always
simulated.** Selling Plays and stocks are refused with the reason.

In the app, long-press a Deck card or open a Play's ⋯ menu → **Replay
against real prices** (24 h / 3 d / 7 d). It shows the result (P&L, or
"Never triggered") and a chart: one neutral price line, dashed level rules
labelled at the right edge, and shaped, labelled entry/exit markers (never
color alone; red/green are close for deuteranopes, per the palette
validator). Drag to scrub.

**Verified (2026-10-24):** 6 replay tests on synthetic candles. Live on
Render: an ETH breakout fired at 2,376.24 and stopped out at 2,352.48
(−$0.14). The UI test caught a real flaw (a visible crossing reading "Never
triggered", because the replay honoured the Play's 1-day window from the
range start); it was fixed and has a regression test. Charts reviewed in
light and dark.

## Account

`GET /v1/account`: Ghost cash and positions derived from Ghost fills
(average price, value and P&L at the live price), plus, for a connected
key, the portfolio's balances, fee tier and open orders (read-only, best
effort). Shown in the Rig tab. **Verified:** a route test (cash $98 and one
ETH position after a $2 fill). The UI test showed "Cash $100 · Coinbase not
connected". The live branch is untested (no funded, connected session).

## Cartridges: share and import

Share any card's or Play's cartridge as JSON (⋯ / long-press → **Share
cartridge**). In the Rig's Lab, **Import a cartridge**: paste it, the engine
validates it (`/v1/cartridges/preview`), and it lands on top of the Deck as
a card to arm. Mode is never part of a cartridge, so an import can't arm
itself live. **Verified:** builds, and the preview route is tested. The
share sheet and import flow haven't been driven by a UI test.
