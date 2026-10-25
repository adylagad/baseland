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
