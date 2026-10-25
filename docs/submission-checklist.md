# Submission checklist

Everything the Coinbase prompt asks for, and the rules a submission can be
disqualified for missing. Source: the sponsor brief "CalHacks: Build agents
that trade and pay" (read 2026-10-24).

**Primary track: Trading Agents.**

---

## Eligibility (each team member)

- [ ] 18+, legal resident of the US or Canada (excluding Quebec)
- [ ] **Verified Coinbase account**, held by the participant themselves
- [x] CDP API key from portal.cdp.coinbase.com

## Required in the submission

- [x] **Project summary**: who it's for, what it does, which agent platform
      and which Coinbase tools it uses (Coinbase CLI / Advanced Trade, x402
      catalog).
- [x] **Working example**: short demo video **and** the repo, with setup
      instructions that another person can follow.
- [x] **Architecture**: diagram or brief explanation of components, controls
      and **known limitations** (from `ARCHITECTURE.md`).
- [x] **Builder feedback**: biggest blocker, how we worked around it, and the
      **one** missing Coinbase capability we most want (from
      `builder-feedback.md`).
- [ ] Optional: opt in to a follow-up conversation with the Coinbase team.

## Rules the demo must visibly respect

- [x] Simulated actions are **clearly labeled** (GHOST, everywhere).
- [x] Credentials are never shown: no keys in the video, repo, logs or
      screenshots.
- [x] We do not manage funds for other people.

## What judges score

Usefulness · Technical design (explain models, tools, memory, scheduling) ·
Ease of reuse · Product feedback. **Not** code volume, returns, or money spent.
