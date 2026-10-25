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
