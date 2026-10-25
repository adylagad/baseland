# engine

The hosted half of Baseland: a Fastify service that runs Plays, watches
markets, asks the Brain at decision points, and talks to Coinbase through the
official `coinbase` CLI. The iOS app talks only to this service and to
Supabase Realtime.

## Run locally

```sh
cp .env.example .env     # fill in the values; see docs/personal-guide/
pnpm install             # from the repo root
pnpm --filter @baseland/engine dev      # tsx watch, reads .env
```

Built: `pnpm --filter @baseland/engine build && node --env-file=.env dist/index.js`.

## Test

```sh
pnpm --filter @baseland/engine test        # vitest, no network
pnpm --filter @baseland/engine typecheck
```

Tests never call Coinbase: the CLI is replaced by
`test/fixtures/fake-coinbase.mjs` or an in-process fake.

## Endpoints so far

| Method | Path | Auth | What |
| --- | --- | --- | --- |
| GET | `/health` | none | Liveness; pinged to keep Render awake |
| GET | `/v1/market/:productId` | none | Live quote from Coinbase's public API |
| GET | `/v1/credentials` | user | Connected portfolio, never the secret |
| POST | `/v1/credentials` | user | Connect a CDP key (`{ id, privateKey }` as downloaded) |
| DELETE | `/v1/credentials` | user | Forget the key |
| POST | `/v1/plays` | user | Create a Play: `{ cartridge, mode }` (mode defaults to `ghost`) |
| GET | `/v1/plays` | user | Your Plays, newest first |
| GET | `/v1/plays/:id` | user | One Play plus its Tape |
| POST | `/v1/plays/:id/{approve,skip,pause,resume,kill}` | user | Control a Play |
| POST | `/v1/kill-all` | user | Stop every running Play of yours |
| GET | `/v1/me` | user | Ghost cash, Coinbase connection, whether live trading is on |
| GET | `/v1/deck` | user | Suggested Plays (`?refresh=1` to rewrite) |
| POST | `/v1/deck/:id/{arm,skip}` | user | Arm a card (`{ mode?, cartridge? }`) or skip it |
| POST | `/v1/plays/draft` | user | `{ text }` → `{ cartridge }` |
| POST | `/v1/cartridges/preview` | user | Validate an edited cartridge and regenerate its sentence |

"User" means `Authorization: Bearer <Supabase access token>`, verified with
`getClaims`.

## Rules that live in this code

- The Coinbase key goes to the CLI through env vars for one child process,
  with a throwaway config dir: never argv, never disk, never logs.
- A key is accepted only if it reaches exactly one portfolio and that
  portfolio is not Default.
- Secrets are AES-256-GCM encrypted (`CREDENTIALS_SECRET`) before they reach
  the database.
- **Live trading is off** unless `LIVE_TRADING_ENABLED=true`, and no live
  order may exceed `LIVE_MAX_ORDER_USD` (default $10), whatever a cartridge
  says.
- The Brain only ever returns a verdict; the runtime builds the order, the
  Leash checks it, and the gateway previews it before placing it.

## How a Play runs

`src/plays/runtime.ts` drives each Play through the state machine in
`src/plays/machine.ts`: armed → watching (deterministic triggers on the live
ticker, `src/market/feed.ts`) → deciding (the Brain) → Leash
(`src/plays/leash.ts`) → awaiting approval → executing (a gateway in
`src/trading/gateway.ts`: Ghost or Coinbase) → watching exits (Ghost) or
done. Every step lands in the Tape. Money is derived from the Tape's fills
(`src/plays/ledger.ts`), never stored.
