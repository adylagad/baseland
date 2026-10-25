-- The security advisor flagged pg_net in the public schema (installed there
-- by keep_engine_awake). pg_net isn't relocatable, so reinstall it in
-- `extensions`. Its functions live in the `net` schema either way, so the
-- keep-alive cron job (net.http_get) is unaffected.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
