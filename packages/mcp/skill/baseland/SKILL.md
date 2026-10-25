---
name: baseland
description: Author, test and stop Baseland Plays (short, event-scoped trading missions that run in GHOST mode and appear in the iPhone's Dynamic Island) through the Baseland MCP server. Use when the user wants to set up a trade idea as a Play ("if ETH breaks 2,400 buy $3"), backtest one on recent prices, check how their Plays are doing, or stop them.
---

# Baseland Plays

A **Play** is one trading idea with a trigger, a window, an order, exits and a
Leash (spending limits). The Baseland engine watches the market and, when the
trigger fires, its agent decides and asks the phone's owner to approve.

Use the `baseland` MCP tools. Everything they do is **GHOST**: simulated, no
real money. The engine refuses live Plays and approvals from this server.

## Rules

- **Always say GHOST** when you describe a Play, a fill or a P&L created here.
  Never imply real money moved.
- **You can't approve trades**, and shouldn't try to work around it. Approval
  happens on the phone (Dynamic Island, lock screen, or the app). Tell the user
  where to look.
- **Show the sentence before arming.** Every Play has a plain-English sentence
  ("If ETH breaks $2,400 in the next 6h, buy $3…"). Read it back to the user.
- **Don't invent product ids.** Use what `draft_play` returns or the ids in the
  examples resource (`ETH-USDC`, `BTC-USDC`, …). Check a price with `quote`.

## Workflow

1. **Check who you are:** `whoami`. "Paired" means Plays appear on the user's
   phone. "Anonymous" means a private Ghost account with no phone; say so.
2. **Draft:** `draft_play` with the user's words. Read back the sentence and
   the key numbers (trigger, amount, window, take-profit / stop).
3. **Test it (recommended):** `replay_play` with the cartridge and `days` (1–7)
   to see how it would have done on real recent prices. It is simulated and
   assumes the agent acted on the first trigger. Report "never triggered"
   plainly; that is useful information.
4. **Adjust** if asked: edit the cartridge JSON (keep the `sentence` chips in
   step with the fields they point to; the engine validates and rejects
   mismatches) and replay again. The schema is the resource
   `baseland://cartridge/schema`; examples are `baseland://cartridge/examples`.
5. **Arm:** `create_play` with the cartridge. If paired, tell the user it is on
   their Island now, and that they approve it there when the trigger fires.
6. **Follow up:** `list_plays`, `get_play` (shows the Tape: everything the agent
   saw, bought, decided and did), `control_play` to pause / resume / skip /
   kill, `kill_all` for everything.

## Limits worth knowing

- Replay covers buying Plays with the trigger and the order on the same asset.
- Stock markets are closed on weekends, so stock Plays won't trigger then.
- The hosted engine runs on a free instance; the first call after a quiet
  spell can take up to a minute.
