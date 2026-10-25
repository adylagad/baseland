# Phase 02 — The agent

Features shipped while building the Brain, evidence, drafting and the Deck
(see `docs/PLAN.md`, Phase 2). Newest first. Append only.

---

## Claude decides at the trigger (with a rules fallback)

**What it does:** when a Play's trigger fires, `ClaudeBrain`
(`claude-opus-5-5`, effort `medium`, server-side refusal fallbacks on) is
asked **once**. It gets three tools:

- `market_context`: free live Coinbase stats for the Play's products (price,
  1h/24h change, 24h range, last-hour volume vs the 24h hourly average, short
  trend);
- `buy_evidence`: one purchase from the Play's allowed Senses, refused in code
  if it would exceed the Play's remaining evidence budget;
- `submit_decision`: `{ verdict: act | skip | wait, headline (≤ 90 chars, for
  the Island), quoteUsd, reasons }`, which must be called once.

The model never sees order tools. The runtime caps `quoteUsd` at the
cartridge's amount, then the Leash and approval policy apply as before.

**Wait verdicts:** the Play keeps watching but isn't asked again for **5
minutes**, and a Play whose Brain has waited **4 times** ends: "The agent
waited 4 times without a good entry; ending the Play." (Found live: without
this, one Play asked Claude 14 times in 150 seconds.)

**Fallback:** `FallbackBrain` uses the rules Brain if Claude errors, refuses
or times out (60 s), and the Tape records `by: "rules (claude-opus-5-5
unavailable)"`. With no `ANTHROPIC_API_KEY` the engine runs on rules alone.
Configurable: `BRAIN_MODEL`, `BRAIN_EFFORT`, `DRAFT_MODEL`.

**Creation doesn't wait:** `POST /v1/plays` returns as soon as the Play is
watching. The first look at the trigger (and any decision) runs in the
background, and the app follows it over Realtime.

**Verified (2026-10-24):** live, locally and on Render. Claude declined a
noise trigger (−0.01%, volume 0.25×) with specific reasons, and acted on a
steady buy-now Play: "ETH is flat near $2,361 with nothing unusual. Buy $3 of
ETH?". It chose not to buy evidence when the market data already decided it.
Unit tests cover the fallback, the cooldown/cap, and evidence budgets via
fake Brains.

## Evidence: Senses, budgets, receipts (simulated for now)

**What it does:** nine Senses picked from Coinbase's real x402 catalog with
their real per-call prices: Exa ($0.025), You.com ($0.105), Massive news and
stock snapshot ($0.01 each), Glassnode funding and exchange balances ($0.05
each), Nansen flows ($0.01) and netflow ($0.05), Arkham trending ($0.20).
A Play lists the Senses it may buy from and a budget (≤ its Leash's
`maxEvidenceUsdc`). The remaining budget is **derived from the Tape**.
Every purchase writes an `evidence` Tape row with its cost and an excerpt.

**Simulated by the user's choice (option b):** `GhostEvidence` records the
real catalog price, fetches nothing, and tells the Brain so. Its rows are
always `simulated: true`, even inside a live Play. `X402Evidence` (real
payments via `coinbase x402 fetch` with `max_amount` and an idempotency key)
is built but **not wired**; it waits for the portfolio to be funded.

**Verified:** unit tests (budget stops a $0.105 purchase after $0.035 is
spent; no double counting; GHOST content). Live, Claude used the tools but
judged evidence unnecessary in both decisions observed.

## Drafting Plays from words

**What it does:** `POST /v1/plays/draft { text }` → `{ cartridge }`. The
model writes only a flat **Draft** (structured outputs). The engine resolves
the product by Coinbase lookup (USDC book first, then USD), builds the
cartridge with a Leash of exactly the order size, and generates the chip
sentence (`sentenceFor`, shared in `@baseland/play-schema`). Missing amount →
$5; missing window → 6h. **Stocks are refused** with the reason: Coinbase
returns no stock price while the market is closed.

`POST /v1/cartridges/preview { cartridge }` validates an edited cartridge and
regenerates its sentence, with no AI involved. This is what the app calls
after a chip edit.

**Verified live:** "put five bucks into eth if it breaks out in the next 3
hours, take profit at 4%" → "If [ETH] breaks above [$2,383.49] in the next
[3h], buy [$5] of [ETH]. Take profit at [+4%]." in 6.7 s.

## The Play Deck

**What it does:** `GET /v1/deck` returns up to five suggested Plays written
from live prices (8 major crypto assets), Ghost cash, and recent Play
titles, each with a one-sentence rationale citing numbers. Cards are cached
for 15 minutes (`?refresh=1` regenerates). `POST /v1/deck/:id/arm { mode?,
cartridge? }` arms a card (the app may send back edited chips) and retires
it; arming twice is a 409. `POST /v1/deck/:id/skip`. Cards that don't
resolve or validate are dropped, never shown broken.

**Verified live:** five varied cards in 17 s (XRP breakout, BTC dip buy, LINK
oversold bounce, ETH reclaim, SOL starter), each citing real prices.
Route tests with a fake drafter.

## Cartridges from drafts (shared)

`cartridgeFromDraft` and `sentenceFor` live in `@baseland/play-schema`, so the
engine and any client phrase a Play identically. 4 tests.
