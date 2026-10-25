# Render and the keep-alive ping

The engine runs as a free Render web service (`baseland-engine`,
`https://baseland-engine.onrender.com`). Free services sleep after 15 minutes
without inbound traffic; a Supabase cron job keeps it awake, so there is no
pinger to set up.

## 1. Render account

1. render.com → sign up **with GitHub** (the `adylagad` account), so Render
   can see the `adylagad/baseland` repo once it exists.
2. Optional, but it lets Claude create the service and read logs directly:
   Account Settings → **API Keys** → create a key, then

   ```sh
   claude mcp add --scope project --transport http render https://mcp.render.com/mcp \
     --header "Authorization: Bearer <RENDER_API_KEY>"
   ```

   Run that yourself, so the key stays out of chat.

## 2. The service (done 2026-10-24)

Claude created it through the Render MCP: Docker, from
`apps/engine/Dockerfile`, health check `/health`, free plan, Oregon. The
secrets from `apps/engine/.env` were set through Render's API without passing
through chat. `render.yaml` records the same shape.

## 3. Auto-deploy: give GitHub the deploy hook (you, once)

Deploys run from GitHub Actions after the engine's tests pass
(`.github/workflows/engine.yml`). It needs one secret, which an agent is not
allowed to write for you:

1. Render → **baseland-engine** → **Settings** → **Deploy Hook** → copy the
   URL. It can only deploy this one service.
2. In this repo's folder, run `gh secret set RENDER_DEPLOY_HOOK --repo
   adylagad/baseland` and paste the URL when it asks. (Or GitHub → repo →
   Settings → Secrets and variables → Actions → New repository secret.)

Until it is set, the workflow's deploy step fails with a message saying so,
and Claude can still deploy through the Render MCP.

## 4. Keep-alive (nothing to do)

A Supabase `pg_cron` job pings `/health` every 5 minutes (migration
`20261025025834_keep_engine_awake.sql`). This uses about 744 of the 750 free
hours a month, which is fine for one service.
