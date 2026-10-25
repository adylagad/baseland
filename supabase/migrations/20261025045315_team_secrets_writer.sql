-- Lets the engine's service role put a shared team secret into Supabase
-- Vault without the value ever passing through SQL typed by a person or an
-- agent: a script calls this over PostgREST with values read from .env.
-- Teammates read secrets in the dashboard SQL editor from
-- vault.decrypted_secrets (see the root README).
-- Only service_role may call it; anon and authenticated cannot.
create function public.put_team_secret(p_name text, p_secret text, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if p_name !~ '^baseland_[a-z0-9_]+$' then
    raise exception 'team secret names must look like baseland_<name>';
  end if;
  select id into existing from vault.secrets where name = p_name;
  if existing is null then
    perform vault.create_secret(p_secret, p_name, p_description);
  else
    perform vault.update_secret(existing, p_secret, p_name, p_description);
  end if;
end;
$$;

revoke execute on function public.put_team_secret(text, text, text) from public, anon, authenticated;
grant execute on function public.put_team_secret(text, text, text) to service_role;
