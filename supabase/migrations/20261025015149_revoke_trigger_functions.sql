-- The trigger functions from core_schema were callable over PostgREST
-- (/rest/v1/rpc/...) by anon and authenticated, flagged by the security
-- advisor. They are only meant to run as triggers.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
