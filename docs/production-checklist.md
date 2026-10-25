# Production checklist

Hackathon shortcuts gathered in one place, so they are never mistaken for the
design. Each item says what is true now and what would have to change before
Baseland could ship to real users.

Items marked **Blocker** would fail App Review, leak money, or break real
users if shipped as they are.

Status is as of the last update to this file and is not checked automatically.

---

## iOS

### Background keep-alive — **Blocker**
**Now:** while a Play is live, the app keeps itself running in the background
so Realtime updates reach the Live Activity. Apple rejects apps that misuse
background modes this way.
**Change:** APNs Live Activity updates and push-to-start (needs the paid
developer account), then remove the keep-alive.

### Free Apple ID signing
**Now:** the app is installed from Xcode with a Personal Team. The provisioning
profile expires after 7 days.
**Change:** paid account, TestFlight, App Store.

## Credentials and money

### Coinbase key pasted by the user — **Blocker** for non-technical users
**Now:** the user creates a CDP API key scoped to a dedicated portfolio and
pastes or scans it in.
**Change:** a consumer OAuth flow. Coinbase's remote MCP OAuth is limited to
allowlisted harnesses today (see `builder-feedback.md`).

### Key encryption
**Now:** encrypted at rest by the engine with a single server secret.
**Change:** per-user envelope encryption via a managed KMS, plus rotation.

## Hosting

### Render free tier with a keep-alive ping
**Now:** the service sleeps after 15 minutes without inbound traffic, so an
external pinger keeps it awake. A cold start pauses every watcher.
**Change:** a paid always-on instance, with watchers in a separate worker and
a queue.

### Keep-alive is a Supabase cron job (added 2026-10-24)
**Now:** instead of cron-job.org, `pg_cron` + `pg_net` in the Supabase
project call `https://baseland-engine.onrender.com/health` every 5 minutes
(job `keep-engine-awake`, migration `20261025025834`). Verified: the first
tick woke a sleeping instance (it timed out at 10 s during the cold start),
and the next returned 200 from the same instance.
**Change:** drop the job (`select cron.unschedule('keep-engine-awake')`) once
the engine runs on an always-on instance.

### Harness tokens are long-lived bearer tokens (added 2026-10-25)
**Now:** a `bl_` token never expires until it is replaced or disconnected.
`pnpm connect-claude bl_…` passes it on the command line (so shell history
keeps it), and Claude Code stores it in plain text in `~/.claude.json`. The
engine checks it with one database update per request (`last_used_at`).
**Change:** an OAuth device flow for the MCP, short-lived tokens with
refresh, scopes per token, and throttled `last_used_at` writes.

### The MCP ships the Supabase publishable key and signs in anonymously (added 2026-10-25)
**Now:** without a token, `packages/mcp` creates an anonymous Supabase user
per machine, so anyone can make Ghost accounts on our project; nothing
limits them.
**Change:** rate-limit anonymous sign-ups (Supabase Auth settings or a
captcha), and clean up idle anonymous users.

### Live trading was switched on once (added 2026-10-25)
**Now:** off again (`LIVE_TRADING_ENABLED=false`, `X402_EVIDENCE_ENABLED=false`
on Render). `LIVE_MAX_ORDER_USD` is still 3. A debug-only app hook connects
a key from a file for UI tests (`-connect-key-file`, `#if DEBUG`).
**Change:** for production, live trading per user (not engine-wide) with an
explicit opt-in flow, and no debug hooks in release builds (they're compiled
out today).
