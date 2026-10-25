# Render and the keep-alive ping

The engine runs as a free Render web service. Free services sleep after 15
minutes without inbound traffic, so a free pinger keeps it awake.

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

## 2. The service (Claude prepares this; you confirm)

The repo will contain a `render.yaml` blueprint and a Dockerfile for
`apps/engine`. Creating it: Render → **New** → **Blueprint** → pick the repo,
or let Claude do it through the Render MCP. The environment variables are the
ones in `apps/engine/.env.example`, entered in the Render dashboard.

## 3. Keep-alive ping

1. cron-job.org → free account → **Create cronjob**.
2. URL: `https://<your-service>.onrender.com/health`, every **10 minutes**.

This uses about 744 of the 750 free hours a month, which is fine for one
service.
