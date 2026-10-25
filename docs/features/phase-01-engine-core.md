# Phase 01 — Engine core (no AI)

Features shipped while building the Play runtime (see `docs/PLAN.md`,
Phase 1). Newest first. Append only.

---

## Play runtime: the lifecycle of a Play

**What it does:** `POST /v1/plays { cartridge, mode }` validates a cartridge
(`@baseland/play-schema`) and creates a Play in **Ghost by default**. From
there the engine runs it:

1. **armed** until `window.startsInMin` passes, then **watching**. On opening,
   it records the **anchor price** (the price at that moment, from the feed or
   the public API) and **evaluates the trigger at once**, so a condition that
   already holds fires immediately.
2. **watching**: deterministic triggers on Coinbase's live ticker:
   `price_cross` (above/below a level), `pct_move` (up/down/either from the
   anchor), `time` (N minutes after opening; 0 = now). Progress 0–1 feeds the
   Live Activity.
3. **deciding**: the Brain is asked once (Phase 1: `RuleBrain`, which proposes
   exactly the cartridge's action). Verdicts: `act`, `skip` (→ done, with the
   reason), `wait` (→ back to watching). The Brain can **never** raise the
   amount above the cartridge's.
4. **Leash** check (below). A failure → **failed** with
   `Leash: <reason>.` and a `leash_reject` Tape row. No order.
5. **awaiting** if the approval policy asks (`ask: "always"` by default;
   `"never"`; or `{ aboveUsd }`), with `pending` holding the proposed order.
   `approve` → executing; `skip` → done ("Skipped by you.").
6. **executing**: preview → order → poll → fill (see the gateways).
7. After an entry BUY with exits: **Ghost** goes back to **watching** in
   `status.phase = "exit"` and sells the whole position on take-profit or
   stop-loss (exits are pre-approved at arming). **Live** attaches the exits
   to the order so **Coinbase holds them**, and the Play ends **done**
   ("Exits held by Coinbase (TP …, SL …)").
8. **done / failed / expired / killed** are terminal. The window closing
   expires anything not mid-order ("Window closed before the trigger." or,
   in the exit phase, "Window closed; position kept.").

**Controls:** `pause` (armed/watching only; stops watching) and `resume`
(back to where it was, or expired if the window passed); `kill` (any
non-terminal state; mid-order it is applied after the order resolves, so the
Tape never pretends an order didn't happen); `POST /v1/kill-all` stops every
non-terminal Play of **that user only**.

**Status snapshot** (`plays.status`, display only): phase, symbol,
headline, progress, price, anchorPrice, pnlUsd, pendingAmountUsd. Price-tick
status writes are throttled (10 s by default) to spare Realtime; state
changes always write.

**Rules:** every transition is asserted against one table
(`plays/machine.ts`) and written with optimistic concurrency (only if the
Play is still in the expected state). Work on a Play is serialized
per Play. Ownership is checked on every command (someone else's Play is a
404). Live mode needs `LIVE_TRADING_ENABLED=true` on the engine **and** a
connected key; otherwise 403.

**Restarts:** on boot every non-terminal Play is re-armed. A Play caught
`deciding` goes back to watching (nothing was ordered). A Play caught
`executing` is reconciled from its Tape: an accepted order is polled to its
result; an order caught mid-submission is **never re-placed**, and the Play
fails with "check Coinbase before retrying".

**Where:** `apps/engine/src/plays/{runtime,machine,triggers,brain,store}.ts`,
`src/routes/plays.ts`.

**Verified (2026-10-24):** 23 runtime scenario tests (full lifecycle, every
approval policy, double-approve places one order, Leash rejections, a greedy
Brain capped, windows/pause/kill/kill-all, ownership, live guards, restart
recovery). **End to end on real services:** the built engine locally, real
Supabase, the live Coinbase ticker. A Ghost `pct_move` Play triggered on real
ETH ticks, asked, was approved over HTTP, filled at the real price, watched
its exits and sold on the stop-loss (P&L −$0.054 = two 0.9% fees plus the
move). 23 Tape rows, all `simulated: true`, readable by the client through
RLS. No warnings or secrets in the log.

**Ghost / Live:** Ghost verified end to end. Live is unit-tested against a
fake gateway only; real money waits for Phase 4.

## The Leash (hard limits before every order)

**What it does:** checked after the Brain and before any gateway, for every
order:

- the product must be on `allowedProducts` (if set);
- entry orders: within `maxOrderUsd`, within `maxPlayUsd` including what this
  Play already spent, within the **engine-wide live ceiling**
  (`LIVE_MAX_ORDER_USD`, default $10, live only), and within available cash
  (Ghost);
- exits may only **sell**, and only up to the position this Play holds.

Rejections read like "$5.01 is over the $5.00 order limit" and land in the
Tape. **Where:** `apps/engine/src/plays/leash.ts`. **Verified:** 6 unit tests
plus runtime scenarios.

## Ghost and Coinbase trading gateways

**Ghost:** fills market orders instantly at the current public price with
Coinbase's Intro taker fee (0.9%), the fee **inside** a BUY's spend as
Coinbase does it. Idempotent by client order id. **Coinbase:** the `coinbase`
CLI in the key's one portfolio. `orders preview` must succeed or a live
order is **not placed**. `orders create` carries
`client_order_id = bl-<playId>-<entry|exit>` (deterministic, so a retry
can't double-order), plus `attached_take_profit_price` /
`attached_stop_loss_price` for live entries with exits. `orders get` is
polled until filled/cancelled/failed (30 s). The idempotency key is written
to the Tape **before** the order is sent; a duplicate is blocked before it
reaches Coinbase. **Where:** `apps/engine/src/trading/gateway.ts`.
**Verified:** unit tests, including the exact CLI arguments; `--dry-run`
of a real `orders create` showed the request body (nothing sent). No real
order yet.

## Live price feed

`CoinbaseTickerFeed` (public ticker WebSocket, no key): lazy connect,
`heartbeats` subscription, reconnect with backoff up to 30 s, resubscribe.
Listeners are keyed on normalized ids (`-USDC` → `-USD`, the trap from
Phase 0) and ticks are re-labelled with the id the caller asked for.
`ReplayFeed` loops a recorded series (for demos on bad Wi-Fi; not wired to a
switch yet). `ManualFeed` drives tests. **Verified:** unit tests and the
end-to-end run above.

## Play cartridge schema

See `packages/play-schema/README.md`: one zod schema, cross-field rules in
the schema, mode deliberately excluded, four reference cartridges, JSON
Schema export. **Verified:** 12 tests.
