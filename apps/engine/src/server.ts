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
import { rigRoutes, type RigRouteDeps } from "./routes/rig.js";
import { harnessRoutes } from "./routes/harness.js";
import { harnessVerifier, type HarnessTokenStore } from "./harness/tokens.js";
import type { PlayStore } from "./plays/store.js";
import type { PlayRuntime } from "./plays/runtime.js";
import type { LivePlayStore } from "./spacetime/store.js";

export interface EngineDeps {
  verifyToken: VerifyToken;
  run: CliRunner;
  credentials: CredentialStore;
  market: MarketData;
  credentialsSecret: string;
  runtime: PlayRuntime;
  words?: Omit<DeckRouteDeps, "auth" | "runtime">;
  me?: { plays: Pick<PlayStore, "ghostCashUsd">; liveTradingEnabled: boolean };
  rig?: Omit<RigRouteDeps, "auth" | "credentials" | "run" | "market">;
  /** Harness tokens (the Baseland MCP); without a store none are accepted. */
  harnessTokens?: HarnessTokenStore;
  version?: string;
  events?: Pick<LivePlayStore, "subscribe">;
}

const startedAt = Date.now();

export function buildServer(deps: EngineDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify({
    ...opts,
    // Never log bodies or auth headers: they carry keys and tokens.
    logger: opts.logger ?? false,
  });
  const auth = requireUser(deps.verifyToken, deps.harnessTokens && harnessVerifier(deps.harnessTokens));

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
  if (deps.events) {
    app.get("/v1/events", { preHandler: auth }, (req, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(": connected\n\n");
      const unsubscribe = deps.events!.subscribe((change) => {
        const owner = change.type === "play" ? change.play.userId : change.tape.userId;
        if (owner === req.userId && !reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(change)}\n\n`);
      });
      const heartbeat = setInterval(() => { if (!reply.raw.destroyed) reply.raw.write(": keepalive\n\n"); }, 20_000);
      req.raw.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
    });
  }
  if (deps.words) deckRoutes(app, { auth, runtime: deps.runtime, ...deps.words });
  if (deps.me) meRoutes(app, { auth, credentials: deps.credentials, ...deps.me });
  if (deps.harnessTokens) harnessRoutes(app, { auth, tokens: deps.harnessTokens });
  if (deps.rig) rigRoutes(app, { auth, credentials: deps.credentials, run: deps.run, market: deps.market, ...deps.rig });

  return app;
}
