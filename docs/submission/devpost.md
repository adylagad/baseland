# Baseland — Devpost submission & demo script

Copy each section into the matching Devpost field. The same text is in the
Claude Doc "Baseland — Devpost submission & demo script" (as of 2026-10-25).

## Devpost basics

| Field | Value |
| --- | --- |
| Project name | Baseland |
| Tagline (≤ 200 chars) | Every market event becomes a Play: a short trading mission that lives in your Dynamic Island, buys its evidence over x402, and waits for your long-press to trade. |
| Track | Coinbase: Build agents that trade and pay — **Trading Agents** (x402 secondary) |
| Repo | [github.com/adylagad/baseland](https://github.com/adylagad/baseland) |
| Demo video | Paste your YouTube / Vimeo link after uploading the final cut |
| Try it | `pnpm connect-claude` (Claude Code, no phone needed) or build the iOS app from source — README → *Try it* |
| Built with | swift, swiftui, activitykit, app-intents, typescript, node.js, fastify, zod, coinbase-advanced-trade, coinbase-cli, x402, base, usdc, claude, anthropic, model-context-protocol, supabase, postgresql, render, github-actions |
| Coinbase follow-up | Opt in (the submission form asks) |

## Inspiration

Trading agents today are either advisors that can't act, or bots you hand a strategy and hope for the best. Neither fits how people actually trade: something happens (a breakout, a dip, earnings), you want to act on *that event* for a few hours, and you want to stay in charge of the money.

So we made the event the unit. A **Play** is a short mission with a trigger, a window, an order and hard limits. It lives in the iPhone's Dynamic Island from start to finish, so you see it think and you approve with a long-press. The agent pays a few cents over x402 for the evidence it needs at the moment it decides, instead of a monthly data subscription.

## What it does

Baseland turns a market event into a **Play**: a short mission with a trigger, a window, an order, exits and a Leash of hard limits. You arm one by saying it ("buy $3 of ETH now, take profit at 3%"), by swiping a card the agent dealt from live prices, or from Claude Code. Then it lives in your Dynamic Island:

1. **Watch.** Plain code watches Coinbase's live prices. There's no AI in the loop while it waits.
2. **Decide.** When the trigger fires, Claude decides once. It can buy evidence (news, on-chain flows) over x402 within the Play's budget, and it returns *act / skip / wait* with its reasons.
3. **Approve.** The Island asks "Buy $3 of ETH?" Long-press to approve or skip, from the Island or the lock screen.
4. **Trade.** The engine checks the Leash, previews the order, then places it, with take-profit and stop-loss attached so Coinbase holds the exits.
5. **The Tape.** Everything the agent saw, bought, decided and did is on a timeline, with a receipt on each paid step.

**Ghost mode** runs the same thing on real prices with pretend money, labelled GHOST everywhere. **The Rig** (advanced mode) lets you swap the Brain (Sonnet / Opus / Haiku / rules), the Senses (which x402 sources it may buy), Instincts, Hands (assets) and the Leash, live. **Replay** runs any Play against real past prices. **Bring your own agent:** the Baseland MCP lets Claude Code draft, replay and arm Plays that land on your Island.

**What ran with real money (Oct 25, 2026).** We switched live trading on for one test, capped at $3:

- A LIVE Play bought **0.0012749 ETH at $2,329.58** ($2.97 + $0.027 fee), approved from the Dynamic Island. Coinbase order `a16a3d1a…` was **filled**, with a take-profit / stop-loss bracket attached ($2,399.22 / $2,259.46).
- The Tape's preview, order and fill match Coinbase's own `orders get`. The portfolio went from $4.00 USDC to 1.00 USDC + 0.0012749 ETH.
- **x402 evidence was attempted live but didn't pay.** Coinbase rejected both attempts before any payment (details under Builder feedback). In Ghost, evidence purchases are simulated at the real catalog prices. Live trading is switched off again on the hosted engine.

## How we built it

Baseland is three pieces: a native iPhone app, a hosted engine that runs the agent, and an MCP server so other agents can author Plays.

| Piece | Built with | What it does |
| --- | --- | --- |
| iPhone app | Swift, SwiftUI (iOS 26), ActivityKit, App Intents | The Deck, Plays, the Rig, Replay; the Live Activity in the Dynamic Island and on the lock screen; Approve / Skip / Pause as Live Activity intents; a Control Center kill switch |
| Engine | TypeScript, Node 22, Fastify, zod; hosted on Render, deployed by GitHub Actions after tests pass | The Play state machine, price watchers, the Brain, the Leash, Ghost and Coinbase trading gateways, Replay |
| Brain | Claude Sonnet 5.5 decides (Opus / Haiku selectable); Claude Haiku 5.5 drafts Plays from words and deals the Deck | Runs once per Play, when the trigger fires; returns a structured decision |
| Coinbase | `coinbase` CLI (Advanced Trade) with a CDP key scoped to one dedicated portfolio; public ticker WebSocket and candles; x402 catalog paid in USDC on Base | Orders (preview → create, exits attached), live prices, paid evidence |
| State | Supabase Postgres + Realtime + anonymous Auth | Plays and the Tape; Realtime drives the Live Activity (no APNs on a free Apple account) |
| Baseland MCP | MCP TypeScript SDK, stdio, plus a Claude Code skill | Draft, replay, arm and stop Ghost Plays from any agent |

**Controls, enforced in code rather than asked of the model:**

- **The model never holds an order tool.** Claude's tools are free market context and budgeted evidence purchases; it returns *act / skip / wait*. The engine checks the Leash, previews, and places the order itself.
- **The Leash:** per-order and per-Play caps, an evidence budget, allowed assets, and an engine-wide ceiling on any live order (set to $3 for our live test). Every live order goes Leash → preview → create with a persisted `client_order_id`.
- **x402 spend:** each payment's `max_amount` is the lower of the catalog price and the Play's remaining budget, with an idempotency key re-derivable after a restart.
- **You approve.** Plays ask before trading by default; approval is a long-press in the Dynamic Island or on the lock screen.
- **Ghost is unmistakable.** Simulated Plays, fills, receipts and Live Activities are labelled GHOST everywhere; live ones say LIVE.
- **Kill switch** in the app, Control Center and Siri. Harness tokens (for Claude Code) can create only Ghost Plays and can never approve.
- **One user, one key, one portfolio.** The key is verified to reach exactly one non-default portfolio, encrypted at rest, and never leaves the engine.

## Architecture and known limitations

One Play, start to fill: plain code watches the market, Claude is asked once when the trigger fires and returns a decision, the person holding the phone approves, and the engine checks the Leash and places the order. Upload `docs/diagrams/architecture.png` from the repo as the Devpost image.

![How one Play runs: arm, watch, Claude decides, approve from the Island, Leash, order](../diagrams/architecture.png)

**Known limitations**

- **No push notifications.** There's no paid Apple account, so no APNs: the Live Activity is fed by Supabase Realtime while the app is alive, kept alive by a hackathon-only background mode.
- **Stocks on weekends.** Coinbase returns no equity prices or previews while markets are closed, so stock Plays run in Ghost and Replay.
- **x402 budgets are ours, not Coinbase's.** Coinbase caps a single payment at 5 USDC; per-Play budgets are enforced by the engine. Payments are irreversible.
- **No fill webhooks.** The engine polls order status.
- **Free hosting sleeps.** Render's free tier is kept awake by a 5-minute Supabase cron ping; a cold start pauses watchers for about a minute.
- **One portfolio per key.** Futures only work in the default portfolio, so they're out of scope.
- **Judges can't install the app without TestFlight.** The reuse path is the Baseland MCP + skill (no phone needed) and building the app from source.

## Builder feedback for Coinbase

**Biggest blocker: a third-party app can't sign users in to Coinbase.** The hosted Coinbase MCP (`agents.coinbase.com/mcp`) uses OAuth, but only allowlisted harnesses (ChatGPT, Claude, Grok, …) can use it. An iPhone app can't.

**How we worked around it.** Each user creates a CDP API key scoped to one dedicated portfolio and pastes the key file into the app. The engine verifies the key reaches exactly one non-default portfolio, encrypts it at rest, and drives the `coinbase` CLI with it, one child process per call. It works, but pasting an API key is a non-starter for real consumers.

**The one capability we want most: scoped OAuth for third-party apps,** with scopes for a single portfolio, trade-only, and a server-enforced x402 spending budget. That would remove key pasting and our own budget bookkeeping in one go.

**Other friction, logged as it happened:**

| What | What happened | Ask |
| --- | --- | --- |
| x402 with a portfolio-scoped key | `x402 fetch` returned 400 "portfolio_id is required because multiple accessible portfolios are available", although the key is denied the Default portfolio (403). With `portfolio_id` it returned 412 "the payment attempt was rejected and no payment was created", with no reason. | Default x402 to the key's portfolio; say *why* a payment was rejected |
| No x402 budget | Only a 5 USDC per-payment cap exists; a session budget "is not server-enforced" | A per-key x402 budget |
| Sandbox | The Advanced Trade sandbox accepts **any** key, returns canned balances, has no market data and no x402 | A sandbox that checks keys and has a test x402 catalog |
| Fills | No webhook or push for fills; agents must poll | Fill webhooks |
| Weekends | Equity products return no price at all outside market hours | Last close + market status |
| `balance` | Rejects the key's own portfolio (400) while `portfolios get` accepts it | Default to the key's scope; explain the failure |

**What worked well:** attached take-profit / stop-loss on a market buy (Coinbase holds the exits even if our engine sleeps), `orders preview`, and the x402 catalog's discovery with input schemas, which made a great menu of Senses for the agent.

## Challenges we ran into

- **No paid Apple account,** so no push notifications. Live Activities are driven over Supabase Realtime, and the Island buttons are Live Activity intents that run inside the app with its session.
- **The agent and real money.** We kept the model away from order tools entirely and put every live order behind Leash → preview → create with a persisted idempotency key, an engine-wide $3 ceiling for the test, and an off-by-default live switch.
- **Getting the agent to use its evidence.** In a rehearsal, Sonnet acted without buying the data the Play asked for. The fix: the person's own words and the Play's sources now go to the Brain, and buying one listed source is a rule, not a suggestion.
- **x402 from a scoped key** never completed a payment (see Builder feedback). Every failed attempt is now written on the Tape instead of disappearing.

## Accomplishments we're proud of

- A **real ETH trade approved with a long-press in the Dynamic Island**, with the exits held by Coinbase and a Tape that matches Coinbase's own order record.
- One sentence to an armed Play in seconds, and an agent that explains every decision in one line on the Island.
- **Bring your own agent:** Claude Code creates Plays that land on your phone, through tokens that can never approve or go live.
- Ghost mode that can't be mistaken for real money, on every screen.

## What we learned

- The right unit for an agent is an *event*, not a strategy: it's bounded in time, money and attention, which makes it safe to hand over.
- Paying per decision over x402 is far cheaper than subscriptions for an agent that only needs data at the moment it decides.
- Labelling simulated actions everywhere costs little and builds a lot of trust.

## What's next

- Scoped OAuth instead of API keys, as soon as Coinbase offers it.
- Push-started Live Activities (APNs) so Plays start without the app open.
- Stock Plays during market hours, with paid stock data over x402.
- A shared library of Play cartridges, with Replay results attached.

---

*Not for Devpost: the sections below are for making the video.*

## Demo video: merge order

Three clips in the repo's `media/` folder (local only, not committed) make 4:20 of footage. Add about 15 s of title at the start and 15 s at the end to land near 5:00. Merge them in this order:

| # | File | Length | Frame | What it shows |
| --- | --- | --- | --- | --- |
| 1 | `01-ghost-tour.mp4` | 1:46 | 1206×2622 portrait | Onboarding, the Deck, a chip, Replay (24 h / 7 d), a Play from words, the agent deciding, approve from the Dynamic Island, the Tape, the Rig. All GHOST. |
| 2 | `02-claude-code.mp4` | 0:39 | 1920×1080 | Claude Code (left) drafts, replays and arms a Play; it lands on the phone (right) and in the Dynamic Island. |
| 3 | `03-real-crypto.mp4` | 1:55 | 1206×2622 portrait | A LIVE Play with real money: the confirm sheet, the agent's decision, Approve from the Dynamic Island, the real order and fill on the Tape, the Coinbase balance after. |

**Editing notes**

- Clips 1 and 3 are portrait: centre them on a 1920×1080 canvas (dark `#14161A` background) next to a caption column, or zoom in on the part being narrated.
- The waits (Claude writing the Deck, deciding) are already cut out. Clip 2 runs in real time, so the terminal and the phone stay in sync. Speed it up 1.25× if you need time back.
- Don't speed up clip 3 around the approval (about 0:55–1:15): that's the moment the judges should see.
- No keys appear in any clip. The Coinbase key was connected off camera.

## Voiceover script (about 5 minutes)

Times are on the merged cut: a 15-second title, then clips 1, 2 and 3, then a 15-second close. About 690 words at a relaxed pace. Clip timecodes are in brackets.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Title card | "Trading agents today either advise and can't act, or act and you hope for the best. Baseland does something in between: every market event becomes a Play, a short mission that lives in your Dynamic Island." |
| 0:15–0:25 | Clip 1 [0:00] onboarding | "You start in Ghost mode: real prices, pretend money. Everything simulated is labelled GHOST, everywhere." |
| 0:25–0:45 | [0:05–0:15] the Deck, a chip | "The agent deals a Deck of Plays from live Coinbase prices. Each one is a sentence you can edit. Tap a chip, like the window, and change it." |
| 0:45–1:00 | [0:20–0:35] Replay | "Before arming anything, replay it on real past prices. This breakout would have stopped out for nineteen cents over the last day, and the same over the week. Better to know now." |
| 1:00–1:15 | [0:35–0:50] say a Play, arm it | "Or just say what you want. 'Buy two dollars of ETH now' becomes a Play. Swipe right, and it's armed, in Ghost." |
| 1:15–1:35 | [0:50–1:10] deciding, the Island | "Plain code watches the price. When the trigger fires, Claude decides, once. It bought Nansen's smart-money data for a cent over x402, simulated here, and then it asks me in the Dynamic Island. I long-press, and approve." |
| 1:35–1:50 | [1:10–1:20] the Tape | "The Tape shows everything: what it bought, why it acted, the preview, the order, the fill. Every step is labelled GHOST." |
| 1:50–2:01 | [1:20–1:46] the Rig | "Advanced mode is the Rig. Swap the Brain between Sonnet, Opus and Haiku, choose which x402 sources it may pay for, and set the Leash." |
| 2:01–2:15 | Clip 2 [0:00–0:12] Claude Code drafting | "Plays don't have to start on the phone. This is Claude Code, with the Baseland MCP server and skill. I ask for an ETH dip-buy, replayed over three days, then armed." |
| 2:15–2:40 | [0:12–0:39] the Play lands on the Island | "It drafts it, replays it, and arms it. And there it is, on my phone and in the Dynamic Island. Claude Code can only create Ghost Plays, and it can never approve. That stays with the person holding the phone." |
| 2:40–2:55 | Clip 3 [0:00–0:15] Settings, saying the Play | "Now real money. This account is connected to one dedicated Coinbase portfolio holding four dollars, and the engine caps any live order at three. 'Buy three dollars of ETH now, check smart-money flows first, take profit at three percent, stop at three.'" |
| 2:55–3:10 | [0:15–0:30] Arm LIVE | "Real money is never a swipe. It's a LIVE button and a confirmation, and the agent still has to ask me before it buys." |
| 3:10–3:35 | [0:30–0:55] deciding, Your call | "Claude decided. Its reasons are on the Tape: flat price, light volume, no reason to skip. It also tried to buy the Nansen data, and Coinbase's x402 rejected the payment, so it says it decided without it. Nothing is hidden." |
| 3:35–3:55 | [0:55–1:10] approve from the Island | "Back to the home screen. The Island says: three dollars of ETH? No GHOST label this time; it's LIVE. Long-press, approve." |
| 3:55–4:20 | [1:10–1:25] the real fill | "Filled. 0.0012749 ETH at $2,329. The engine checked the Leash, previewed the order, then placed it, and the take-profit and stop-loss ride on the order, so Coinbase holds them even if our server sleeps. That's a real order ID on the Tape." |
| 4:20–4:35 | [1:25–1:55] the Rig and the account | "And here's the Coinbase portfolio after the trade: $3.97. The Rig is still the one control panel for all of it." |
| 4:35–4:50 | Closing card | "Baseland: every market event becomes a Play. The model never holds an order tool, you approve every trade from your Island, and anyone can try it today from Claude Code with one command. Thanks for watching." |
