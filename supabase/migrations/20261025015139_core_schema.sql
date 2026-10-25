-- Baseland core schema.
--
-- Clients (the iOS app) only ever READ these tables, scoped to their own rows
-- by RLS. Every write goes through the engine with the service role, so the
-- engine can validate cartridges, enforce the Leash and keep the Tape honest.
-- `credentials` has RLS enabled and no policies at all: no client can read it.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  default_mode       text not null default 'ghost' check (default_mode in ('ghost', 'live')),
  -- Brain / Senses / Instincts / Hands / Leash, validated by the engine.
  rig                jsonb not null default '{}'::jsonb,
  -- Ghost mode starts every user with pretend cash; balances are derived from the Tape.
  ghost_starting_usd numeric(14, 2) not null default 100,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- A profile exists for every auth user, including anonymous ones.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------- credentials
-- One Coinbase CDP key per user, scoped by Coinbase to one portfolio.
-- The secret is AES-256-GCM encrypted by the engine; the database never sees
-- plaintext.
create table public.credentials (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  key_id            text not null,
  secret_ciphertext text not null,
  portfolio_uuid    text not null,
  portfolio_name    text not null,
  verified_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------------------------- plays
create table public.plays (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  -- The chip sentence as the user sees and edits it.
  sentence     jsonb not null,
  -- The full cartridge (see packages/play-schema).
  spec         jsonb not null,
  mode         text not null check (mode in ('ghost', 'live')),
  state        text not null default 'armed' check (state in (
                 'armed', 'watching', 'deciding', 'awaiting', 'executing',
                 'done', 'paused', 'killed', 'expired', 'failed')),
  state_reason text,
  -- The decision waiting for the user while state = 'awaiting'.
  pending      jsonb,
  -- Display snapshot for the Live Activity (headline, progress, price).
  -- Not a source of truth: P&L and spend are derived from the Tape.
  status       jsonb not null default '{}'::jsonb,
  window_start timestamptz not null default now(),
  window_end   timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (window_end > window_start)
);

create index plays_user_state_idx on public.plays (user_id, state);

-- -------------------------------------------------------------------- tape
-- Append-only record of everything a Play saw, bought, decided and did.
create table public.tape (
  id              bigint generated always as identity primary key,
  play_id         uuid not null references public.plays (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  at              timestamptz not null default now(),
  kind            text not null check (kind in (
                    'state', 'observe', 'trigger', 'evidence', 'decision',
                    'approval_request', 'approval', 'leash_reject',
                    'order_preview', 'order', 'fill', 'error', 'note')),
  -- Sponsor rule: every simulated action is labeled. No default on purpose.
  simulated       boolean not null,
  cost_usdc       numeric(14, 6) not null default 0 check (cost_usdc >= 0),
  payload         jsonb not null default '{}'::jsonb,
  -- Set for actions that move money (orders, x402), so a retry after an
  -- unknown outcome can never create a second one.
  idempotency_key text unique
);

create index tape_play_at_idx on public.tape (play_id, at);
create index tape_user_idx on public.tape (user_id);

-- -------------------------------------------------------------- deck_cards
create table public.deck_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  sentence   jsonb not null,
  spec       jsonb not null,
  rationale  text not null,
  event_at   timestamptz,
  status     text not null default 'suggested' check (status in ('suggested', 'armed', 'skipped')),
  created_at timestamptz not null default now()
);

create index deck_cards_user_status_idx on public.deck_cards (user_id, status);

-- --------------------------------------------------------------------- RLS
alter table public.profiles    enable row level security;
alter table public.credentials enable row level security;
alter table public.plays       enable row level security;
alter table public.tape        enable row level security;
alter table public.deck_cards  enable row level security;

create policy "owner reads own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner reads own plays" on public.plays
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner reads own tape" on public.tape
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner reads own deck" on public.deck_cards
  for select to authenticated using ((select auth.uid()) = user_id);
-- credentials: deliberately no policy.

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.plays;
alter publication supabase_realtime add table public.tape;

-- ------------------------------------------------------------ updated_at
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger plays_touch before update on public.plays
  for each row execute function public.touch_updated_at();
