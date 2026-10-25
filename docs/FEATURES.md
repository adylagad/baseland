# Feature ledger

**Index of every feature that has shipped, newest first.** Each entry links to
its full record in `docs/features/`, one file per plan phase
(`phase-NN-slug.md`).

The point: a commit log is not a specification. When someone has to demo,
explain, debug or re-implement a feature at 4am, the behaviour and the rules
must be written down in one place, along with **how it was verified**.

---

## How to use it

**Every feature gets recorded here in the same change that implements it.**
Not afterwards, not at the end of a phase.

Each record says:

- **What it does**: the behaviour a user sees, and the rules behind it.
- **Where it lives**: iOS, engine, MCP, database (paths are fine).
- **Verified**: what was actually *run* (simulator, device, test, curl, real
  order), and what is only assumed. Unverified behaviour also gets an entry in
  `development-testing-backlog.md`.
- **Ghost / Live**: whether it works with simulated actions, real ones, or
  both.

**Append only.** New entries go on top, and a phase file gains sections.
Nothing is removed, and existing entries are not rewritten. A feature that
changes later gets a **new** entry in the newer phase file that restates the
whole behaviour (not the delta) and names what it extends, plus a one-line
`→ extended in phase-NN` appended to the old entry and an updated row in the
index below.

## Feature index

| Feature | Latest record | Status |
| --- | --- | --- |
| Connect Claude Code from the app (masked token) | [phase-06](./features/phase-06-reuse.md#connect-claude-code-from-the-app) | Shipped (simulator e2e) |
| Baseland MCP server + Claude Code skill (harness tokens) | [phase-06](./features/phase-06-reuse.md#baseland-mcp-server-and-claude-code-skill) | Shipped (Claude Code verified) |
| The Rig (Brain, Senses, Instincts, Hands, Leash) | [phase-05](./features/phase-05-rig.md#the-rig-a-plug-and-play-agent) | Shipped |
| Replay against real past prices | [phase-05](./features/phase-05-rig.md#replay-a-play-against-real-past-prices) | Shipped (crypto buys) |
| Account (Ghost; live read-only) | [phase-05](./features/phase-05-rig.md#account) | Shipped (live branch untested) |
| Cartridge share and import | [phase-05](./features/phase-05-rig.md#cartridges-share-and-import) | Shipped (UI flow untested) |
| Approve from the Dynamic Island / lock screen | [phase-03](./features/phase-03-island.md#approve-from-the-lock-screen-iphones-without-a-dynamic-island) | Shipped (both verified in simulators) |
| Kill switch: app, Control Center, Siri | [phase-03](./features/phase-03-island.md#kill-switch-in-the-app-control-center-siri) | Shipped (app verified; CC/Siri unverified) |
| The Deck: swipe to arm, chips, composer | [phase-03](./features/phase-03-island.md#the-deck-swipe-to-arm) | Shipped (voice unverified) |
| Plays and the Tape (app) | [phase-03](./features/phase-03-island.md#plays-and-the-tape) | Shipped |
| Live Activity driven by the engine | [phase-03](./features/phase-03-island.md#live-activity-driven-by-the-engine) | Shipped (simulator) |
| Onboarding and session | [phase-03](./features/phase-03-island.md#onboarding-and-session) | Shipped |
| Claude decides at the trigger (+ rules fallback, wait cooldown) | [phase-03](./features/phase-03-island.md#claude-decides-at-the-trigger-sonnet-55-and-drafts-haiku-55) | Shipped (Sonnet 5.5) |
| Evidence: Senses, budgets, receipts | [phase-02](./features/phase-02-the-agent.md#evidence-senses-budgets-receipts-simulated-for-now) | Shipped (simulated by choice) |
| Drafting Plays from words; chip preview | [phase-03](./features/phase-03-island.md#claude-decides-at-the-trigger-sonnet-55-and-drafts-haiku-55) | Shipped (crypto, Haiku 5.5) |
| The Play Deck | [phase-03](./features/phase-03-island.md#claude-decides-at-the-trigger-sonnet-55-and-drafts-haiku-55) | Shipped (Haiku 5.5) |
| Play runtime (lifecycle, controls, restarts) | [phase-01](./features/phase-01-engine-core.md#play-runtime-the-lifecycle-of-a-play) | Shipped (Ghost e2e; live unit-tested) |
| The Leash | [phase-01](./features/phase-01-engine-core.md#the-leash-hard-limits-before-every-order) | Shipped |
| Ghost and Coinbase trading gateways | [phase-01](./features/phase-01-engine-core.md#ghost-and-coinbase-trading-gateways) | Shipped (no real order yet) |
| Live price feed | [phase-01](./features/phase-01-engine-core.md#live-price-feed) | Shipped |
| Play cartridge schema | [phase-01](./features/phase-01-engine-core.md#play-cartridge-schema) | Shipped |
| Play Live Activity (Dynamic Island + lock screen) | [phase-00](./features/phase-00-foundations.md#play-live-activity-dynamic-island--lock-screen) | Shipped (simulator) |
| Connect a Coinbase key (engine) | [phase-00](./features/phase-00-foundations.md#connect-a-coinbase-key-engine) | Shipped |
| Live quote endpoint | [phase-00](./features/phase-00-foundations.md#live-quote-endpoint) | Shipped |
| Health endpoint | [phase-00](./features/phase-00-foundations.md#health-endpoint) | Shipped |
| Core schema | [phase-00](./features/phase-00-foundations.md#core-schema) | Shipped |

## Phases

| Phase | Record |
| --- | --- |
| 06 Reuse and submission | [phase-06-reuse.md](./features/phase-06-reuse.md) |
| 05 The Rig | [phase-05-rig.md](./features/phase-05-rig.md) |
| 03 Island (iPhone app) | [phase-03-island.md](./features/phase-03-island.md) |
| 02 The agent | [phase-02-the-agent.md](./features/phase-02-the-agent.md) |
| 01 Engine core | [phase-01-engine-core.md](./features/phase-01-engine-core.md) |
| 00 Foundations | [phase-00-foundations.md](./features/phase-00-foundations.md) |
