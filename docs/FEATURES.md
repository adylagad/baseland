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
| Connect a Coinbase key (engine) | [phase-00](./features/phase-00-foundations.md#connect-a-coinbase-key-engine) | Shipped |
| Live quote endpoint | [phase-00](./features/phase-00-foundations.md#live-quote-endpoint) | Shipped |
| Health endpoint | [phase-00](./features/phase-00-foundations.md#health-endpoint) | Shipped |
| Core schema | [phase-00](./features/phase-00-foundations.md#core-schema) | Shipped |

## Phases

| Phase | Record |
| --- | --- |
| 00 Foundations | [phase-00-foundations.md](./features/phase-00-foundations.md) |
