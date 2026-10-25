# Feature backlog

Features that are **missing**: never built, or cut on purpose.

One of three tracking docs:

| Doc | Answers |
| --- | --- |
| [`production-checklist.md`](./production-checklist.md) | What hack must be undone before this could ship for real? |
| [`development-testing-backlog.md`](./development-testing-backlog.md) | What is built but unverified? |
| **this file** | What was never built? |

**Effort** is a rough size, not a promise: **S** under an hour, **M** a few
hours, **L** most of a day.

---

## Deliberately out of scope for the hackathon

### APNs-driven Live Activities (push-to-start, remote updates) — L
Needs a paid Apple Developer account. Designed (engine pushes Live Activity
updates; starts one when an event window opens) but not built. Replaced by
Supabase Realtime plus a background keep-alive.

### TestFlight distribution — S once the account exists
Also needs the paid account. Until then, judges build from source or use the
MCP/skill path.

### Other model providers in the Brain slot — M
OpenAI-compatible adapter (OpenAI, Grok, OpenRouter). The Brain interface
allows it; only Claude is planned.

### Futures Plays — M
Coinbase futures work only in the **default** portfolio, and each CDP key is
scoped to one portfolio. Supporting it means a second key scoped to the
default portfolio, which weakens the "agent only touches its own portfolio"
story.

### Prediction-market Plays — ?
Not in Coinbase's MCP or CLI yet ("coming soon").

### Thesis Garden — L
Long-term beliefs with explicit invalidation conditions, checked weekly with
paid evidence. A future Play type.

### Second Look — M
Before any trade, the agent pays for evidence and argues the opposite case for
ten seconds. A Rig toggle.

### Shared cartridge gallery — M
Export/import is planned; a public gallery of community Plays is not.

### Web viewer for Plays and the Tape — M
Would let judges without an iPhone see a running Play. Only if time remains.
