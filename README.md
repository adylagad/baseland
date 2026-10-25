# Baseland

**Every market event becomes a Play.** Baseland is an iOS app whose trading
agent runs short, event-scoped missions inside your Dynamic Island. It buys
the evidence it needs over x402 for a few cents and asks you to approve with
a long-press. It works across crypto and US stocks on Coinbase.

Built for the CalHacks 2026 Coinbase prompt, **Trading Agents** track.

- The product: [`docs/IDEA.md`](docs/IDEA.md)
- How it works: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Build plan: [`docs/PLAN.md`](docs/PLAN.md)

> **Status:** planning complete, implementation not started. Setup and run
> instructions will appear here as each piece lands.

## Layout

| Path | What |
| --- | --- |
| `apps/ios` | SwiftUI app, Live Activity / Dynamic Island, App Intents |
| `apps/engine` | Hosted TypeScript engine: Play runtime, watchers, agent, Coinbase CLI gateway |
| `packages/play-schema` | The Play cartridge format |
| `packages/mcp` | Baseland MCP server and Claude Code skill |
| `supabase` | Database migrations |

## Safety

Simulated (GHOST) actions are labeled everywhere. Each user connects their own
Coinbase API key scoped to a dedicated portfolio; keys stay in the engine.
The AI model never holds order-placing tools; the engine enforces hard limits
and previews every order.
