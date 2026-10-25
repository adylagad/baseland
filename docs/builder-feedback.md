# Builder feedback

A running log of friction with Coinbase for Agents, the CLI and x402, kept as
it happens. **Product feedback is a judging criterion**, and specific, dated
notes beat a summary written from memory on the last night.

Each entry has: what we tried, what happened, how we worked around it, and
what Coinbase could change. Append only. Pick the submission's "biggest
blocker" and "one missing capability" from here at the end.

---

## 2026-10-24: found while planning (from the docs, before writing code)

### The remote MCP OAuth is allowlisted to specific harnesses
**Tried:** using "Sign in with Coinbase" (agents.coinbase.com/mcp) from our
own iOS app.
**Happened:** only allowlisted clients (ChatGPT, Claude, Grok, Muse,
Perplexity, Codex) can use it.
**Workaround:** each user creates a CDP API key scoped to a dedicated
portfolio and gives it to our engine, which drives the `coinbase` CLI.
**Ask:** OAuth for third-party apps, with scopes for portfolio, trade-only and
x402-budget. Pasting API keys is a non-starter for consumers.

### No server-side spending budget for x402
**Happened:** there is only a 5 USDC per-payment cap. A budget set in chat
"is not server-enforced".
**Workaround:** the engine enforces a per-Play evidence budget.
**Ask:** a per-key or per-session x402 budget enforced by Coinbase.

### No push or webhook for order fills
**Happened:** nothing tells an agent that an order filled. `--watch` streaming
works only from the local CLI with an API key, not over OAuth.
**Workaround:** the engine polls order status.
**Ask:** fill webhooks. These matter even more for mobile and Live Activity
surfaces.

### Equities lack previews and candles in the agent API
**Workaround:** buy stock data over x402 (Massive).

### Portfolios can only be created on the website, and futures only work in the default portfolio
**Impact:** onboarding has to send mobile users to a desktop browser.
Futures Plays conflict with "the agent only touches its own portfolio".

## 2026-10-24: first contact with the CLI and the sandbox

### The Advanced Trade sandbox accepts any key and has no market data or x402
**Tried:** checking a sandbox-created CDP key with `portfolios list` and
`balance` against `https://api-sandbox.coinbase.com` (CLI 0.0.10, via
`COINBASE_URL`).
**Happened:** both returned the same canned data (100 USDC, 1 ETH, 0.5 BTC,
$100) even with a **randomly generated key**, so the sandbox validates
nothing. `products get ETH-USDC` returned 404. `x402 resources` failed with
"Agent API endpoint is not configured for environment sandbox".
**Workaround:** a production key scoped to an empty portfolio for read-only
checks, and our own Ghost gateway (real public prices, simulated fills) for
testing.
**Ask:** a sandbox that authenticates keys, serves real or replayed market
data, and has a test x402 catalog paid in test USDC. Right now there is no
way to rehearse an agent end to end without real money.

### Env-var keys need `COINBASE_ENV` too
`COINBASE_KEY_ID`/`COINBASE_KEY_SECRET` alone fail with "no environment
configured". `COINBASE_ENV=live` must also be set. The README's configuration
table lists all three, but its quick start only shows `coinbase env live`.

### `balance` rejects the key's own portfolio while `portfolios get` accepts it
**Tried (production key scoped to an empty portfolio "baseland", type
CONSUMER):** `coinbase balance portfolio_id==<baseland uuid>`.
**Happened:** HTTP 400 "cannot access the specified portfolio; pass a
portfolio_id from coinbase_portfolios_list", although that uuid came from
`portfolios list`. Without `portfolio_id`, it returned 403 because it falls
back to the default portfolio, which the key can't see. `portfolios get
<uuid>` on the same portfolio worked and returned $0 totals.
**Workaround:** read balances from `portfolios get`.
**Ask:** default `balance` to the key's scoped portfolio, and make the error
say *why* access failed (empty? wrong type? scope?).

## 2026-10-24: building the order path (Phase 1)

### `orders get` doesn't document its status values
The CLI help lists `status` in the response but not its possible values.
We map FILLED / CANCELLED / EXPIRED / FAILED and treat everything else
(OPEN, PENDING, QUEUED, ...) as still open. **Ask:** enumerate statuses in
the CLI help and the MCP tool schema; agents poll on them.

### `--dry-run` output isn't JSON
`--dry-run` prints `would execute orders_create` and then the JSON body, so
it can't be piped to a JSON parser like every other command. **Ask:** emit
`{ "dry_run": true, "operation": ..., "body": ... }`.

### Attached exits on a market BUY are great, and nearly invisible
`attached_take_profit_price` / `attached_stop_loss_price` on `orders create`
let an agent hand its exits to the exchange, which is exactly right for an
agent that might be asleep. It's mentioned in passing in the CLI help;
Baseland relies on it for live Plays. **Ask:** document it prominently as the
recommended pattern for agents.
