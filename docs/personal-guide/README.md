# Personal guide

Setup that a person has to click through, because it needs a browser, an
account you own, money, or a secret. An agent cannot do these for you.

Dashboard labels change, and these steps were written from the providers'
docs on 2026-10-24 rather than clicked through. If a label differs, follow
the intent and fix the guide.

## Guides

| Guide | What it unlocks | Roughly |
| --- | --- | --- |
| [Coinbase portfolio and API key](./coinbase-api-key.md) | Live trading and x402 payments | 15 min |
| [Anthropic API key](./anthropic-api-key.md) | The agent's Brain | 3 min |
| [Supabase project](./supabase.md) | Database, auth, Realtime | 10 min |
| [Render and the keep-alive ping](./render.md) | The hosted engine | 10 min |
| [Run on your iPhone](./iphone.md) | The Dynamic Island on a real device | 10 min |

Do Coinbase first. It is the only step that may involve waiting, if account
verification is pending.

## Where secrets go

**Never in the repo, chat, screenshots or the demo video.**

- Local development: `apps/engine/.env` (gitignored). A template lives in
  `apps/engine/.env.example`.
- Hosted: Render → service → Environment.
- The Coinbase key JSON file: keep it outside the repo, e.g.
  `~/.config/baseland/`.
