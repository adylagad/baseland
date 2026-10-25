import { createClient } from "@supabase/supabase-js";
import { supabaseVerifier } from "./auth.js";
import { createCliRunner } from "./coinbase/cli.js";
import { loadConfig } from "./config.js";
import { supabaseCredentialStore } from "./credentials/store.js";
import { createPublicMarket } from "./market/public.js";
import { buildServer } from "./server.js";

const config = loadConfig();

const db = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = buildServer(
  {
    verifyToken: supabaseVerifier(db),
    run: createCliRunner(),
    credentials: supabaseCredentialStore(db),
    market: createPublicMarket(),
    credentialsSecret: config.CREDENTIALS_SECRET,
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
  },
  {
    logger: {
      level: config.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.body"],
    },
  },
);

app.listen({ port: config.PORT, host: config.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.close().finally(() => process.exit(0));
  });
}
