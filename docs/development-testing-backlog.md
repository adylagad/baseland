# Development testing backlog

Behaviour that is **built but unverified**, or **unknown and worth finding out
before a demo finds it out for us**.

An item leaves this list when it has been *run* and the result written down in
a [context log](./context/), not when the code looks right.

**Confidence** is how sure we are it works today:

- **Unknown**: no idea which way it goes
- **Likely fine**: the code (or docs) read correctly, but nothing has run it
- **Known gap**: it does not work, deliberately

---

## Platform unknowns to settle in Phase 0

### Live Activities with a free Apple ID (Personal Team) — Likely fine
Live Activities need only `NSSupportsLiveActivities`, not a paid entitlement.
Widget extensions can be signed by a Personal Team. Confirm on the device.

### `LiveActivityIntent` buttons while the app is suspended — Likely fine
The system should launch the app in the background to run the intent. Confirm
that Approve from the Dynamic Island reaches the engine with the app
suspended, and also after it has been killed.

### Background keep-alive keeps Realtime updates flowing — Unknown
How long the app stays alive on the lock screen with the chosen keep-alive,
and whether iOS throttles it under Low Power Mode.

### Control Center control with a free Apple ID — Unknown
iOS 18 control widgets live in the widget extension. They should work, but
nothing has confirmed it.

### Which USDC balance pays for x402 when the key is scoped to the Baseland portfolio — Unknown
Coinbase docs say x402 uses "your retail USDC balance on Base". With a key
scoped to a non-default portfolio, it is unclear whether payments draw from
that portfolio or the primary one. Test with a 1-cent resource.

### `coinbase` CLI behaviour on Render (Linux, no libsecret) — Unknown
We pass keys via env vars, not the keychain. Confirm the CLI reads
`COINBASE_KEY_ID` / `COINBASE_KEY_SECRET` and writes nothing secret to disk.

### Coinbase public ticker WebSocket from Render — Likely fine
Outbound WebSockets should be unaffected by the free tier, but the 15-minute
sleep counts only inbound traffic. Confirm the ping keeps the process awake.

## Coinbase key (production, scoped to "baseland")

### Verified 2026-10-24
The production key authenticates. `portfolios list` shows Default and
baseland. `portfolios get baseland` works ($0). `portfolios get Default` is
**denied (403)**, so the scoping holds. `products get ETH-USDC` returns a live
price, `x402 resources` returns the catalog (You.com search, 0.105 USDC per
call), and `fees` shows the Intro tier (taker 0.9%, maker 0.5%).

### `balance` on the scoped portfolio — Known gap, re-check after funding
It returns 400 "cannot access the specified portfolio" even with the correct
uuid. Possibly because the portfolio is empty, or because it is a CONSUMER
portfolio. Use `portfolios get` until re-checked with funds in it.

## Live Activity (Phase 0)

### Seen in the simulator 2026-10-24
The demo Play's Live Activity appears in the iPhone 17 (iOS 26.5) simulator's
Dynamic Island and updates while another app is in front: watching (blue dot
plus countdown), deciding (amber sparkles), awaiting (`$3.00?` coral), done
(`+$0.12` green), each with the dashed GHOST ring.

### Update rate is throttled — Known, needs a device check
Local updates every 4 s arrived visibly slower (after ~25 s it was still on
step 5 of 7). Real Plays change stage rarely, but a live price in the
expanded view will not tick every second. Re-check on the iPhone with
`NSSupportsLiveActivitiesFrequentUpdates`, which is already set.

### Background updates on a real phone — Unknown
The simulator kept updating while backgrounded; a real iPhone suspends apps
much sooner. This is what the keep-alive in Phase 3 is for.

### Expanded and lock-screen presentations on the device — Unknown
Only verified as rendered in the in-app Island Lab (same views), not
long-pressed on the real Island or seen on a real lock screen.

## Resolved 2026-10-24

### `coinbase` CLI on Render (Linux, no libsecret) — Answered: works
Connecting the scoped key through the **deployed** engine
(`POST https://baseland-engine.onrender.com/v1/credentials`) found the
`baseland` portfolio, so the CLI runs in the container and reads keys from
env vars. It writes only to the per-call temp config dir, which is deleted.

### Render free tier sleeping — Answered: handled by the Supabase cron ping
See `production-checklist.md`. (The ticker WebSocket from Render is still
untested; it arrives with the watchers in Phase 1.)
