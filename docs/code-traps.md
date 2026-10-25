# Code traps

Narrow, code-level rules that exist because ignoring one produced a failure
**here**. Not style, not architecture: each one is something the obvious
implementation gets wrong.

**Read this before touching the Coinbase gateway, order placement, x402, the
Live Activity, App Intents, or the database schema.** It is referenced from
`AGENTS.md` rather than imported, because most sessions never touch any of it.

Each entry says when it bit and what the symptom was, so a reader can tell a
scar from a precaution. The common thread: compiling is not evidence.

---

## Known before writing code (precautions, not scars yet)

These come from Coinbase's docs, not from failures here. They are listed so
the first implementation gets them right. When one actually bites, add the
date and symptom.

### Market buys use `quote_size`, sells use `base_size`
Futures market orders reject `quote_size` entirely. Limit orders take
`base_size` + `limit_price`.

### `ETH-USD` vs `ETH-USDC` are different products
Coinbase notes that lower-tier models pick the wrong one. Product ids come from
the cartridge or a `products list` lookup. Never take them from model output.

### x402 `max_amount` is in atomic units
`1000000` = 1 USDC. It can lower the 5 USDC per-payment ceiling but not raise
it, and it is **not** a session budget. Ours is enforced in the engine.

### Reuse the idempotency key when an x402 or order outcome is unknown
A new key after a timeout can create a second hold or a second order. Generate
the key once per logical action, persist it, then retry with the same key.

### Equities: no previews, reference prices only
`products get AAPL-USD` is a reference price, not an executable quote.
`orders preview` may be unavailable. Orders trade in regular market hours by
default.

## Coinbase CLI

### Keys via env vars also need `COINBASE_ENV`
**Bit 2026-10-24.** With only `COINBASE_KEY_ID` and `COINBASE_KEY_SECRET`
set, CLI 0.0.10 fails with `no environment configured`. Set
`COINBASE_ENV=live` too. Also set `COINBASE_NO_HISTORY=1` (otherwise the CLI
keeps a request history) and a per-process `COINBASE_CONFIG_DIR`, so nothing
user-specific lands in a shared config dir on the server.

### The sandbox proves nothing about a key
**Bit 2026-10-24.** `api-sandbox.coinbase.com` returned canned portfolios and
balances for a random key. Never treat a sandbox success as key verification.
It also has no product data and no x402.

## Market data

### The ticker WebSocket relabels USDC products as USD
**Seen 2026-10-24.** Subscribing to `ETH-USDC` on
`wss://advanced-trade-ws.coinbase.com` (`ticker` channel, no auth) yields
ticks and a subscription ack for **`ETH-USD`**. Coinbase unified the USD and
USDC books. A watcher that matches incoming ticks by the cartridge's product
id never fires. Normalize both sides (`-USDC` → `-USD`) when matching ticks,
but keep the cartridge's id for orders.

## iOS

### Hold a Live Activity's id, never the `Activity` object
**Bit 2026-10-24.** Storing `Activity<PlayActivityAttributes>` on a
`@MainActor` controller and calling `await current?.update(...)` fails to
compile under Swift 6: "sending 'self.current.some' risks causing data races".
`Activity` is not Sendable. Keep only `activity.id`, and do the
update or end in a `nonisolated static` helper that looks the activity up in
`Activity<PlayActivityAttributes>.activities`.

### The compact Island truncates a countdown narrower than ~58pt
**Bit 2026-10-24.** `Text(timerInterval:)` in 13pt mono with
`.frame(maxWidth: 52)` rendered as `5:59:…` in the real Dynamic Island. 12pt
mono at a fixed 58pt width fits `5:59:58`. Check any trailing-compact change
on the simulator; the Island Lab preview does not enforce the system's width.
