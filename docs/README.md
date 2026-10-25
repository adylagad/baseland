# docs

Written material for Baseland: the idea, the plan, the record of what was
built, and the backlogs. `AGENTS.md` is the source of truth for the rules
below; this file is the map.

## What goes where

| Path | Contents | Agent may write unprompted |
| --- | --- | --- |
| `IDEA.md` | The product: Plays, Island, Rig, x402, demo, judging map | No |
| `ARCHITECTURE.md` | Components, decisions, data model, known limitations | No |
| `PLAN.md` | Phased build plan with checkboxes | Tick boxes only |
| `FEATURES.md` + `features/phase-NN-slug.md` | Ledger of every shipped feature, with how it was verified | Append only |
| `code-traps.md` | Code rules that exist because ignoring one broke something | Append only |
| `builder-feedback.md` | Coinbase friction, logged as it happens (a judging criterion) | Append only |
| `development-testing-backlog.md` | Built but unverified, or unknown | Append only |
| `feature-backlog.md` | Never built, or cut on purpose | Append only |
| `production-checklist.md` | Hackathon shortcuts that must not ship | Append only |
| `submission-checklist.md` | What Coinbase requires in the submission | Tick boxes only |
| `personal-guide/` | Click-through setup only a person can do | No (except fixing a wrong step, said in chat) |
| `TIMELINE.md` | Rolling summary of every context log, loaded every session | Yes |
| `context/YYYY-MM-DD.md` | What happened in each session, one file per date | Yes |
| `README.md` | This file | Yes |

**Append only** means new entries may be added without asking. Rewriting or
removing existing entries needs the user's permission in chat, with one
exception: an item in a backlog may be *resolved* by appending its outcome to
it, together with a context log that records what was run. Nothing is
silently deleted.

## What does not go here

- **Rules AI tools must follow** go in `AGENTS.md`, which is loaded
  automatically. A rule written only in `docs/` will not be followed.
- **How to run a piece of the repo** goes in that piece's `README.md`.

## Context logs

One file per **date** (the day the work happened, taken from commit
timestamps), several sessions per file. Each records what was built, why
decisions went the way they did, what was verified versus assumed, and what
is still broken. Updating a log means updating `TIMELINE.md` in the same
change. Corrections go in the newest log; older logs are not rewritten.
