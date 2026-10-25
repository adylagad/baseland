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

## Phase 1 (engine core)

### Live orders through `CoinbaseGateway` — Known gap until Phase 4
Only unit-tested against a fake CLI, plus a `--dry-run` of the request
body. Unverified against Coinbase: the real `orders create` response shape
(`success_response.order_id` vs top-level `order_id`; both are handled), the
`orders get` status strings, whether `attached_*_price` is accepted on a
market BUY with `quote_size` in a CONSUMER portfolio, and how long a market
order takes to report FILLED.

### Ticker feed over hours — Unknown
Reconnect and resubscribe are unit-tested with a fake socket. Not yet
observed: a real disconnect, or the feed staying healthy on Render for hours.

### Throttled status writes vs the Live Activity — Unknown
Price ticks write `plays.status` at most every 10 s. Whether that feels live
enough on the Island is a Phase 3 question.

### `ReplayFeed` — Built, not wired
There is no switch yet to run the engine on recorded prices (for the
demo-on-bad-Wi-Fi plan).

### Ticker feed from Render — Answered 2026-10-24: works
The end-to-end Ghost Play ran on the deployed engine
(`baseland-engine.onrender.com`, commit 0a69896): it triggered on live ETH
ticks and sold on its stop-loss. Hours-long stability is still unobserved.

## Phase 2 (the agent)

### Real x402 evidence — Known gap (deliberate, option b)
Every purchase is simulated (`GhostEvidence`). `X402Evidence` is built but
unwired and has never paid: the `x402 fetch` argument names
(`input:=`, `max_amount=`, `idempotency_key=`) come from the CLI skill doc
and are untested, and each Sense's expected `input` shape (Exa/You `query`,
Massive ticker paths, Glassnode `a=` asset params) is unknown. Wire it and
test with one 1-cent Sense after funding.

### Claude latency on the phone — Likely fine
Decisions took ~10-13 s, the Deck 17 s, drafts ~7 s. Creation no longer
blocks on the decision; the Deck and drafting UI need visible progress.

### Stock Plays — Known gap
No stock price source while the market is closed (Coinbase returns none).
Drafting refuses stocks, and the Deck is crypto-only.

## Phase 3 (the iPhone app)

### Verified in the simulator 2026-10-24
Both XCUITests pass against the deployed engine: the words → Deck → swipe →
Island → approve-in-app → Tape flow, and **approving from the expanded
Dynamic Island via SpringBoard**, which filled the Play with the app in the
background.

### On a real iPhone — Unknown (the Phase 3 exit check)
Not run on a device yet: install with a free Apple ID, Island buttons with
the app suspended or killed, the keep-alive holding Realtime on a locked
phone for an hour, Live Activity update throttling, and Face ID above $25.

### Control Center control and Siri phrase — Likely fine, unverified
Built (`KillSwitchControl`, `BaselandShortcuts`); both run the same
LiveActivityIntent as the Island buttons, which is verified. Needs a device
or manual simulator check.

### Voice input — Unknown
Hold-to-talk uses SFSpeechRecognizer on device. The simulator has no useful
microphone; needs a device.

### A deleted user's JWT works until it expires — Known, acceptable
The engine verifies Supabase JWTs locally (`getClaims`), so a token for a
user deleted from `auth.users` keeps passing auth for up to an hour.
Writes then fail on the foreign key. The app returns to onboarding on a 401.
Matters only for test cleanup today.

### Ghost cash in the header after a fill — Likely fine
The app refetches `/v1/me` when a `fill` or `state` Tape row arrives over
Realtime. The UI test screenshots were taken before a fill reached the
header; not explicitly checked.

### Lock-screen approval — Answered 2026-10-24: works (simulator)
On an iPhone 16e simulator (no Dynamic Island), Approve on the locked
screen's Live Activity filled the Play. The user's iPhone has Live
Activities but no Dynamic Island, so this is its approval path. Device
testing is deferred by the user's choice; simulators only for now.
