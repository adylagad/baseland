-- Render's free tier sleeps a web service after 15 minutes without inbound
-- traffic, which would pause every Play watcher. Supabase pings the engine's
-- /health every 5 minutes instead of an external pinger (no extra account).
-- Hackathon-only: see docs/production-checklist.md.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'keep-engine-awake',
  '*/5 * * * *',
  $$ select net.http_get('https://baseland-engine.onrender.com/health', timeout_milliseconds := 10000) $$
);
