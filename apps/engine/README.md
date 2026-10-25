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

"User" means `Authorization: Bearer <Supabase access token>`, verified with
`getClaims`.

## Rules that live in this code

- The Coinbase key goes to the CLI through env vars for one child process,
  with a throwaway config dir: never argv, never disk, never logs.
- A key is accepted only if it reaches exactly one portfolio and that
  portfolio is not Default.
- Secrets are AES-256-GCM encrypted (`CREDENTIALS_SECRET`) before they reach
  the database.
