import Fastify, { type FastifyServerOptions } from "fastify";
import { requireUser, type VerifyToken } from "./auth.js";
import type { CliRunner } from "./coinbase/cli.js";
import type { CredentialStore } from "./credentials/store.js";
import type { MarketData } from "./market/public.js";
import { credentialRoutes } from "./routes/credentials.js";
import { marketRoutes } from "./routes/market.js";

export interface EngineDeps {
  verifyToken: VerifyToken;
  run: CliRunner;
  credentials: CredentialStore;
  market: MarketData;
  credentialsSecret: string;
  version?: string;
}

const startedAt = Date.now();

export function buildServer(deps: EngineDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify({
    ...opts,
    // Never log bodies or auth headers: they carry keys and tokens.
    logger: opts.logger ?? false,
  });
  const auth = requireUser(deps.verifyToken);

  // Pinged every 5 minutes by a Supabase cron job to keep the Render free
  // instance awake (migration keep_engine_awake).
  app.get("/health", async () => ({
    ok: true,
    version: deps.version ?? "dev",
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  }));

  marketRoutes(app, deps.market);
  credentialRoutes(app, {
    auth,
    run: deps.run,
    store: deps.credentials,
    secret: deps.credentialsSecret,
  });

  return app;
}
