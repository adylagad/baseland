import Fastify, { type FastifyServerOptions } from "fastify";
import { requireUser, type VerifyToken } from "./auth.js";
import type { CliRunner } from "./coinbase/cli.js";
import type { CredentialStore } from "./credentials/store.js";
import type { MarketData } from "./market/public.js";
import { credentialRoutes } from "./routes/credentials.js";
import { marketRoutes } from "./routes/market.js";
import { playRoutes } from "./routes/plays.js";
import { deckRoutes, type DeckRouteDeps } from "./routes/deck.js";
import { meRoutes } from "./routes/me.js";
import type { PlayStore } from "./plays/store.js";
import type { PlayRuntime } from "./plays/runtime.js";

export interface EngineDeps {
  verifyToken: VerifyToken;
  run: CliRunner;
  credentials: CredentialStore;
  market: MarketData;
  credentialsSecret: string;
  runtime: PlayRuntime;
  words?: Omit<DeckRouteDeps, "auth" | "runtime">;
  me?: { plays: Pick<PlayStore, "ghostCashUsd">; liveTradingEnabled: boolean };
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

  // Action endpoints (approve, kill, ...) take no body, but clients often send
  // `Content-Type: application/json` anyway; Fastify's default parser answers
  // those with 400. Treat an empty JSON body as no body (docs/code-traps.md).
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = String(body);
    if (text.trim() === "") return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = Object.assign(new Error("invalid JSON body"), { statusCode: 400 });
      done(err, undefined);
    }
  });

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
  playRoutes(app, { auth, runtime: deps.runtime });
  if (deps.words) deckRoutes(app, { auth, runtime: deps.runtime, ...deps.words });
  if (deps.me) meRoutes(app, { auth, credentials: deps.credentials, ...deps.me });

  return app;
}
