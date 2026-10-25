# Phase 00 — Foundations

Features shipped while building the foundations (see `docs/PLAN.md`,
Phase 0). Newest first. Append only.

---

## Connect a Coinbase key (engine)

**What it does:** a signed-in user (anonymous Supabase auth is enough) sends
their CDP key file, exactly as downloaded (`{ id, privateKey }`), to
`POST /v1/credentials`. The engine asks Coinbase which portfolios the key can
reach and accepts it only if:

- it reaches **exactly one** portfolio, and
- that portfolio is **not** the account's Default portfolio.

Otherwise it answers 400 with a sentence the app can show as-is ("this key
can access your Default portfolio; scope it to a dedicated portfolio
instead", "...more than one portfolio...", "Coinbase rejected this key
(401). Is it a production key?").

On success it stores the key id, the AES-256-GCM-encrypted secret, and the
portfolio's uuid and name. `GET /v1/credentials` reports
`{ connected, portfolio: { uuid, name }, verifiedAt }` and never the secret
or ciphertext. `DELETE` forgets the key.

**Rules:** the secret reaches the CLI only via env vars of one child process
with a throwaway config dir. Clients cannot read the `credentials` table
(RLS, no policy). Request bodies and auth headers are redacted from logs.

**Where:** `apps/engine/src/routes/credentials.ts`,
`src/coinbase/{cli,account}.ts`, `src/crypto.ts`,
`src/credentials/store.ts`; table `public.credentials`.

**Verified (2026-10-24):** 18 vitest tests (scoping rules, ciphertext-only
storage, the CLI env contract, error parsing). End to end on the real
services: anonymous sign-in, the user's real scoped (unfunded) key
connected as `baseland`, row stored as `v1:` ciphertext, a client token
reads `[]` from `credentials`, and the engine log has no key material.

**Ghost / Live:** needed only for Live; Ghost works without a key.

## Live quote endpoint

**What it does:** `GET /v1/market/:productId` (no auth) returns
`{ productId, price, change24hPct, at }` from Coinbase's public market API.
Ids are upper-cased and validated (`ETH-USDC`, `AAPL-USD`).

**Where:** `apps/engine/src/routes/market.ts`, `src/market/public.ts`.

**Verified (2026-10-24):** a live ETH-USDC price from the locally running
engine, plus a vitest route test.

**Ghost / Live:** both. This is the price source for Ghost fills.

## Health endpoint

`GET /health` → `{ ok, version, uptimeSec }`. `version` is the Render git
commit when deployed. It exists for the keep-alive pinger.

**Verified (2026-10-24):** locally and in vitest.

## Core schema

Tables `profiles`, `credentials`, `plays`, `tape`, `deck_cards`, owner-only
read RLS, Realtime on `plays` and `tape`, and a profile auto-created for
every auth user (including anonymous). `tape.simulated` has no default, so
every write must state whether it was Ghost.

**Verified (2026-10-24):** migrations applied; security advisor re-run; an
anonymous user's profile was created by the trigger (`ghost`,
`ghost_starting_usd = 100`).

## Play Live Activity (Dynamic Island + lock screen)

**What it does:** a Play is shown as a Live Activity with four
presentations, all driven by `PlayActivityAttributes` (static: playId,
title, symbol, isGhost) and its `ContentState` (stage, headline, price,
progress 0–1, pnlUSD, pendingAmountUSD, endsAt):

- **Compact leading:** stage dot + symbol (`● ETH`). A GHOST Play's dot is
  ringed with a dashed lavender line.
- **Compact trailing:** depends on stage: armed/watching/paused → countdown
  to `endsAt` (H:MM:SS); deciding → amber `sparkles`; awaiting → the amount
  in coral with a question mark (`$3.00?`); executing → a circular-arrows
  symbol; done → signed P&L, green or red; killed/expired/failed → the stage
  label.
- **Minimal:** a ring that fills toward the trigger in the stage color
  (full while awaiting), with a centre dot that is lavender for GHOST.
- **Expanded:** stage label + title (leading); GHOST badge + price
  (trailing); headline + progress bar (bottom). No buttons yet; Approve /
  Skip / Pause arrive with App Intents in Phase 3.
- **Lock screen:** a card with stage, GHOST badge, price, title, headline,
  progress and countdown; a GHOST card has a dashed lavender border.

**Rules:** the stage color is the only strong color. Money and prices are
monospaced. Stage raw values match `plays.state` exactly (tested). GHOST is
shown on every presentation.

**Where:** `apps/ios/BaselandKit/Sources/BaselandKit/` (`PlayStage`,
`PlayActivityAttributes`, `Theme`, `IslandViews`, `DemoPlay`),
`apps/ios/Widgets/PlayLiveActivity.swift`,
`apps/ios/App/LiveActivityController.swift`; a development screen, the
Island Lab (`App/IslandLabView.swift`), renders every presentation for
every stage.

**Verified (2026-10-24):** seen in the iPhone 17 / iOS 26.5 simulator's real
Dynamic Island for watching, deciding, awaiting and done (screenshots), and
updating while another app was in front. Expanded and lock screen were
verified only through the Island Lab's rendering of the same views. 5 Swift
Testing tests pass. Device behaviour is listed in the testing backlog.

**Ghost / Live:** both; the demo Play is always GHOST.
