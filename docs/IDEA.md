# Baseland — the idea

> Every market event becomes a **Play**. Your agent runs it inside your Dynamic
> Island from start to finish, buys the evidence it needs for a few cents over
> x402, and asks you only when it matters. You approve with a long-press.

Built for the **CalHacks 2026 Coinbase prompt, "Trading Agents" track**, with
x402 payments as a deliberate secondary. This file is the product as decided on
2026-10-24. It is the user's document: change it only with permission (see
`AGENTS.md`).

---

## 1. The problem

People who hold crypto *and* stocks lose money and sleep around **events**:
earnings, Fed decisions, token unlocks, futures expiries, sudden breakouts.
The event is short, it happens while they are busy, and the right move depends
on information they don't have time to gather.

What exists today does not fit that shape:

- **Chat agents** (Coinbase for Agents inside ChatGPT/Claude, Robinhood Agents,
  Public AI Agents) need you to open a conversation, phrase a request, and stay
  there. Nothing lives where your attention already is.
- **Standing rules / loops** (Public's agents, Robinhood "Loops", coming soon)
  run forever. An event has a beginning and an end; a rule doesn't.
- **Data** is sold as monthly subscriptions (Robinhood Agent Apps, $10–30/mo
  each) when an agent needs one answer, once, at the moment of decision.
- **Coinbase Advisor** advises but cannot trade.

## 2. The answer: Plays

A **Play** is a short, event-scoped mission with a beginning and an end:

> "NVDA reports tonight. If they beat and raise guidance, buy $25 of NVDA.
> If it drops 6% afterwards, sell. Spend at most $0.10 on research."

> "If ETH breaks $4,000 on volume in the next 6 hours, buy $5. Take profit
> at +4%, stop at −2%."

Every Play goes through one lifecycle, and that lifecycle *is* the interface:

```
Armed ──► Watching ──► Deciding ──► Awaiting you ──► Executed ──► Done
   │          │            │              │                         ▲
   └──────────┴────────────┴──── Paused / Killed / Expired ─────────┘
```

- **Armed** — created, waiting for its window to open (e.g. earnings at 4:05pm).
- **Watching** — window open; deterministic watchers track price/conditions.
  No AI runs here, so it is cheap and predictable.
- **Deciding** — a trigger fired. The agent buys evidence via x402 (news,
  on-chain data, stock data), reasons, and produces a decision with a one-line
  reason.
- **Awaiting you** — the decision needs approval (default). Approve / Skip
  from the Dynamic Island.
- **Executed** — the engine previews the order, checks the Leash, places it.
- **Done / Expired** — the Play ends. It never lingers.

Plays map exactly onto what iOS **Live Activities** are designed for: a
time-boxed event with a live status (Apple expects ≤ 8 hours). That fit is the
core of the product, not a decoration.

## 3. Two modes, like Coinbase's Simple and Advanced trade

### Basic — "Island"

For someone who never wants to configure anything.

- **No chat.** Home is the **Play Deck**: a stack of swipeable cards the agent
  writes from your holdings and the upcoming calendar (earnings, Fed meetings,
  unlocks, breakouts). **Swipe right to arm, left to skip.**
- **Fill-in-the-blank sentences, not prompts.** Every Play is a sentence whose
  bracketed parts are tappable **chips**:

  > When **[NVDA earnings]** **[beat]**, **[buy]** **[$25]** of **[NVDA]**,
  > exit at **[−6%]**.

  Tap a chip → a picker or slider. Or say one sentence out loud; it becomes a
  chip sentence you can adjust. The model fills chips; it never chats back.
- **The Dynamic Island is the main screen.**
  - *Compact:* asset glyph + colored stage dot (leading), countdown or live
    P&L (trailing).
  - *Minimal:* the stage dot, pulsing while the agent is deciding.
  - *Expanded:* trigger progress, the agent's latest one-line reasoning, and
    **Approve / Skip / Pause** buttons that work without opening the app.
  - *Lock screen:* the full Play card.
- **Safety:** approval from the Island only up to a limit (default $25);
  larger needs Face ID in the app. A **Control Center kill switch** and a Siri
  phrase ("Baseland, pause everything") stop every Play at once.
- **Ghost mode** — paper trading, the default for new users. Every simulated
  action is labeled **GHOST** everywhere it appears (sponsor rule).

### Advanced — "The Rig"

For someone who wants to own the agent. The agent is assembled from five
slots, each swappable:

| Slot | What it controls |
| --- | --- |
| **Brain** | Which model decides (Claude Opus / Sonnet / Haiku; other providers if time), how cautious, when it must ask. |
| **Senses** | x402 data providers it may buy from (Massive for stocks, Exa / You.com for news, Glassnode / Nansen / Arkham on-chain), each with a per-Play budget. |
| **Instincts** | Swappable strategy personalities: momentum, contrarian, steady accumulator, hedger. Prompt modules, editable. |
| **Hands** | What it may touch: asset classes (crypto, stocks, futures), order types, which portfolio. |
| **Leash** | Hard limits the engine enforces: max notional per order and per Play, max x402 spend, allowed assets, expiry, approval threshold. |

Also in the Rig:

- **Play Cartridges** — a Play is a JSON file. Export, share by link, import.
- **Replay** — run a Play against a past event ("how would this have done on
  NVDA's last earnings?"). Always GHOST. This is the track's "agent that tests
  investment ideas."
- **The Tape** — a timeline of everything the agent saw, bought, decided and
  did, with an **x402 receipt** on each paid step ("this decision cost $0.04").
- **Account** — portfolios, balances, positions, open orders, fees, transfers
  between your own portfolios. The "manage the whole profile" promise.
- **Bring your own harness** — the Baseland MCP server and a Claude Code skill
  let other agents author Plays that appear on your Island.

## 4. Where x402 fits

The agent buys evidence **at the moment it must decide**, never on a
subscription. Each Play carries an evidence budget; the engine enforces it
(Coinbase does not enforce session budgets — only a 5 USDC per-payment cap).
Every payment lands in the Tape as a receipt.

It is also genuinely needed, not bolted on: Coinbase's MCP has no reliable
candles or previews for equities, so stock Plays buy market data from Massive
over x402.

Demo line: *"Robinhood charges $10–30 a month per data source. Baseland paid
4 cents for this decision."*

## 5. Design direction

Not a crypto app, not a chat app.

- **Calm surface, loud state.** Paper-like neutrals; the only strong color is a
  Play's stage (armed / watching / deciding / awaiting / executed / ghost).
- **Numbers in monospace**, words in the system sans. Money is always mono.
- **Subtle terrain motif** (the "land" in Baseland): faint contour lines behind
  the Deck that tighten as a Play approaches its trigger. Restrained, never a
  game map.
- **Cards and chips are the only input primitives.** If a screen needs a text
  box, question the screen.
- **GHOST** has its own unmistakable treatment (dashed outlines, ghost glyph)
  so a simulated action can never be mistaken for a real one.

## 6. Who it's for

Primary: a retail investor who holds both crypto and US stocks on Coinbase,
checks their phone 80 times a day, and cannot sit through an earnings call or
watch a chart for six hours.

Secondary (Rig): a technical trader who wants to plug their own strategy,
model and data into an agent without building infrastructure.

## 7. How it maps to the judging criteria

| Criterion | Answer |
| --- | --- |
| **Usefulness** | A clear user and a clear job: act on events without watching them. Each Play is a bounded task with a visible outcome. |
| **Technical design** | AI only at decision points; deterministic watchers in between. LLM proposes, engine disposes: the model never holds order tools. Leash enforced server-side; preview before every order; idempotent orders; full Tape. |
| **Ease of reuse** | Ghost mode works without a Coinbase key. Engine is hosted. Baseland MCP + skill let anyone create and replay Plays from Claude Code. iOS builds from source with a free Apple ID. |
| **Product feedback** | Kept as we go in `docs/builder-feedback.md`. |

## 8. Rules from the sponsor brief we design around

- Real money is not required; **simulated actions must be labeled** → Ghost.
- **Keep credentials private** → keys live only in the engine, encrypted, never
  returned to any client or log.
- **Don't manage funds for other people** → every user connects their own
  Coinbase key scoped to their own dedicated portfolio. No pooling, ever.
- Judges do **not** score code volume, returns, or money spent.

## 9. What we decided not to build (for now)

- **Thesis Garden** (long-term beliefs with invalidation conditions) — a
  possible future Play type.
- **Second Look** (agent argues the opposite before a trade) — a Rig toggle if
  time allows.
- **Portfolio-as-a-map** visuals — gimmicky; kept only as the contour motif.
- Prediction markets — not in Coinbase's MCP yet.

## 10. The 3-minute demo

1. Open Baseland. The Deck shows "ETH breakout — next 6h". Swipe right.
2. Tap the **[$5]** chip, drag to $3. Arm it **Live**.
3. Lock the phone. The Live Activity is on the lock screen; go home — it sits
   in the Dynamic Island.
4. Trigger fires. Island pulses *Deciding*. The agent pays $0.03 for news +
   on-chain data (receipts appear).
5. Island expands: "Breakout confirmed on volume, funding neutral. Buy $3
   ETH?" Long-press **Approve**.
6. Real order fills in the dedicated Baseland portfolio. Tape shows preview,
   Leash check, order, fill, receipts.
7. Open the Rig. Swap Brain from Sonnet to Opus; toggle Nansen off.
8. Replay an NVDA earnings Play against last quarter — GHOST.
9. From Claude Code, create a Play through the Baseland MCP; it appears on the
   phone.

The stock market is closed during the hackathon weekend, so stock Plays are
shown in Ghost and Replay; the live trade is crypto.
