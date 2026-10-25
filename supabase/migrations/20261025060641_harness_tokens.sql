-- Harness tokens: how the Baseland MCP (Claude Code, other agents) acts for
-- a user, so Plays it creates appear on that user's Island.
--
-- One token per user, minted by the engine from the app's Account screen and
-- shown once. Only its SHA-256 is stored. Like `credentials`, RLS is on with
-- no policy at all: only the engine (service role) reads or writes it. What a
-- token may do (Ghost Plays only, never approve) is enforced by the engine.

create table public.harness_tokens (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.harness_tokens enable row level security;
-- harness_tokens: deliberately no policy.
