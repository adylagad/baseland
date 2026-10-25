# Development timeline

Rolling summary of every context log in `docs/context/`, newest first. Loaded
automatically via `AGENTS.md`, so every session starts knowing what the
project has been through. Keep entries short; detail lives in the logs.

---

## 2026-10-24 — [context](./context/2026-10-24.md)

**Ideation and planning; no code yet.** Read the Coinbase sponsor brief,
researched the competition, picked the idea, and wrote the docs.

- **Idea: Plays.** Short, event-scoped agent missions that live in the Dynamic
  Island (Live Activities), with Approve/Skip from the Island, x402
  pay-per-decision evidence, Ghost (labeled paper) mode, and an advanced
  "Rig" where Brain, Senses, Instincts, Hands and Leash can be swapped. See
  `IDEA.md`.
- **Already shipped elsewhere, so avoided as headlines:** Coinbase Advisor
  (advises, cannot trade), Robinhood Agents and Agent Apps (Loops coming
  soon), Public AI Agents (chat-built rules plus marketplace), and Coinbase's
  planned per-trade and spend caps.
- **Constraints that shaped it:** the remote Coinbase MCP is allowlisted, so
  we use the `coinbase` CLI with a portfolio-scoped CDP key. There is no paid
  Apple account, so no APNs; Realtime plus a keep-alive instead. The
  hackathon is on a weekend, so stock Plays run in Ghost and Replay. Hosting
  is Render free with a ping.
- Team of 2; Claude writes the iOS app and the engine. $20 budget for the
  live crypto trade and x402.
