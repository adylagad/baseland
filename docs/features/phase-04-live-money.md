# Phase 04 — Live money

Features shipped while running Baseland with real money (see `docs/PLAN.md`,
Phase 4). Newest first. Append only.

---

## Arm a Play with real money from the app

**What it does:** with a Coinbase key connected **and** live trading on in the
engine, the Deck shows a red **LIVE** button beside the Ghost arm button.
Real money is never a swipe: LIVE opens a confirmation ("Arm with real
money? Up to $X from your Coinbase portfolio 'baseland'. The agent still asks
you before it buys, and the Leash caps every order."). A live Play wears a
solid red **LIVE** badge wherever a Ghost one says GHOST: the Plays list, the
Play's page, and the Live Activity (lock screen and expanded Island).

**Where:** `DeckView.swift` (button + dialog), `AppModel.canGoLive`,
`LiveBadge` in BaselandKit `IslandViews.swift`.

**Verified (2026-10-25), iPhone 17 simulator, deployed engine, real key:**
the recorded test `FinalRecordingTests.testClip3LiveCrypto` armed a LIVE Play
through the confirmation, and it showed LIVE in the list, the page and the
expanded Island. A rehearsal ended with Skip from the Island (no order).

## Live order end to end (one real trade)

**What it does:** a LIVE Play runs Leash → `orders preview` → `orders create`
through the `coinbase` CLI with the user's portfolio-scoped key and a
persisted `client_order_id`, with take-profit and stop-loss attached for
Coinbase to hold. It then polls the fill and writes it to the Tape, unlabelled
as simulated. The engine's `LIVE_TRADING_ENABLED` switch gates it, and
`LIVE_MAX_ORDER_USD` caps every order.

**Verified (2026-10-25), with the user's go-ahead, once:**
`LIVE_TRADING_ENABLED=true` and `LIVE_MAX_ORDER_USD=3` on Render. A Play
"buy $3 of ETH now, take profit 3%, stop 3%" was decided `act` by Sonnet
5.5, approved from the Dynamic Island, previewed (fee est. $0.0268), placed,
and **filled: 0.0012749 ETH at $2,329.58, fee $0.0267** (Coinbase order
`a16a3d1a-3ace-467a-85f8-54c76bd1e4a8`), with a `trigger_bracket_gtc`
attached at $2,399.22 / $2,259.46. A read-only `orders get` matches the Tape.
The portfolio went from $4.00 USDC to 1.0033 USDC + 0.0012749 ETH. Live
trading was switched off again afterwards. A bug this found: the Play's
summary showed exits recomputed from the fill, not the prices sent (fixed in
`887f20c`; the recording shows the old text).

## Real x402 evidence for live Plays — not working yet

**What it does:** with `X402_EVIDENCE_ENABLED=true`, a live Play's evidence
purchases go through `coinbase x402 fetch` with the Sense's own input (Nansen
flow-intelligence: chain + WETH/WBTC address + timeframe), `max_amount` =
min(price, remaining budget), a deterministic idempotency key, and the key's
`portfolio_id`. Ghost Plays always simulate. A failed purchase writes an
`error` row to the Tape. The Brain must buy one of a Play's listed sources
before deciding, budget permitting.

**Verified:** 4 tests with a faked CLI; `--dry-run` of the exact request
accepted. **Not verified: no real payment has succeeded.** Attempt 1 (in the
live trade): 400 "portfolio_id is required because multiple accessible
portfolios are available" (fixed in `987e2a8`). Attempt 2: 412 "the payment
attempt was rejected and no payment was created". Nothing was charged either
time. The cause of the 412 is unknown (testing backlog).
