# Supabase project

Database, auth and Realtime. The free tier is enough. Note that the free tier
allows **two active projects per organization**; if palysta's project plus
another already use both slots, pause one or create a new organization.

## 1. Create the project

1. supabase.com/dashboard → **New project** → name it `baseland`, choose a
   region near you (US West for CalHacks), and save the database password in
   your password manager.
2. Copy the **Project ref** from Project Settings → General.

## 2. Add the Supabase MCP for this repo (lets Claude run migrations)

From the repo root:

```sh
claude mcp add --scope project --transport http supabase \
  "https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
```

Then run `/mcp` in Claude Code → **supabase** → **Authenticate**.
`.mcp.json` is gitignored, matching palysta.

## 3. Auth settings

Authentication → Providers: enable **Anonymous sign-ins**. Ghost mode works
without an account, and Sign in with Apple needs a paid developer account.

## 4. Keys the engine needs (in `apps/engine/.env`, never in chat)

- `SUPABASE_URL`: Project Settings → API → Project URL
- `SUPABASE_ANON_KEY`: the public anon / publishable key (this one also goes
  into the iOS app; it is designed to be public)
- `SUPABASE_SERVICE_ROLE_KEY`: the secret / service-role key. Engine only,
  never in the app.
