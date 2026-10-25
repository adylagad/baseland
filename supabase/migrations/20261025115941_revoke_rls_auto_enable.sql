-- rls_auto_enable() is Supabase's auto-enable-RLS helper: the function behind
-- the `ensure_rls` event trigger, which turns RLS on for every new table in
-- public. Keep it. But anon and authenticated could EXECUTE it over
-- PostgREST (/rest/v1/rpc/rls_auto_enable), flagged by the security advisor.
-- An event trigger fires without the caller's EXECUTE grant, so revoking it
-- leaves the trigger working (checked after applying).
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
