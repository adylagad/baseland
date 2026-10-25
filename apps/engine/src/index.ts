import { createClient } from "@supabase/supabase-js";
import { supabaseVerifier } from "./auth.js";
import { createCliRunner } from "./coinbase/cli.js";
import { decryptSecret } from "./crypto.js";
import { CoinbaseTickerFeed } from "./market/feed.js";
import { ClaudeBrain } from "./brain/claude.js";
import { supabaseDeckStore } from "./brain/deck-store.js";
import { Drafter } from "./brain/drafter.js";
import { GhostEvidence, X402Evidence } from "./brain/evidence.js";
import { FallbackBrain, RuleBrain, type Brain } from "./plays/brain.js";
import { supabaseRigStore } from "./rig/store.js";
import { PlayRuntime } from "./plays/runtime.js";
import { supabasePlayStore } from "./plays/store.js";
import { CoinbaseGateway, GhostGateway } from "./trading/gateway.js";
import { loadConfig } from "./config.js";
import { supabaseCredentialStore } from "./credentials/store.js";
import { supabaseHarnessTokenStore } from "./harness/tokens.js";
import { createPublicMarket } from "./market/public.js";
import { buildServer } from "./server.js";

const config = loadConfig();

const db = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const run = createCliRunner();
const credentials = supabaseCredentialStore(db);
const market = createPublicMarket();
const ghost = new GhostGateway(market);

// Placeholder logger until Fastify's exists; replaced below.
let log: import("./plays/runtime.js").Logger = console as never;

// Claude decides when there's a key; the rules Brain covers any failure, so a
// bad network degrades a decision instead of failing the Play. Each user's
// Rig picks the model and effort; Brains are cached per combination.
const rules = new RuleBrain();
const brains = new Map<string, Brain>();
const claudeBrain = (model: string, effort: "low" | "medium" | "high"): Brain => {
  if (!config.ANTHROPIC_API_KEY || model === "rules") return rules;
  const key = `${model}/${effort}`;
  let b = brains.get(key);
  if (!b) {
    b = new FallbackBrain(new ClaudeBrain({ model, effort }), rules, (err) => log.warn({ err: String(err), model }, "Claude brain failed; used rules"));
    brains.set(key, b);
  }
  return b;
};
const brain: Brain = claudeBrain(config.BRAIN_MODEL, config.BRAIN_EFFORT);
const rigs = supabaseRigStore(db);
// Ghost Plays always simulate evidence. Live Plays pay over x402 from the
// user's own key only when X402_EVIDENCE_ENABLED is on.
const evidence = new GhostEvidence();
const plays = supabasePlayStore(db);

const runtime = new PlayRuntime({
  store: plays,
  feed: new CoinbaseTickerFeed({ log: { warn: (o, m) => log.warn(o, m) } }),
  market,
  brain,
  rigFor: (userId) => rigs.get(userId),
  brainFor: (rig) => claudeBrain(rig.brain.model, rig.brain.effort),
  async evidenceFor(play) {
    if (play.mode !== "live" || !config.X402_EVIDENCE_ENABLED) return evidence;
    const cred = await credentials.get(play.userId);
    if (!cred) return evidence;
    return new X402Evidence(run, { keyId: cred.keyId, secret: decryptSecret(cred.secretCiphertext, config.CREDENTIALS_SECRET) });
  },
  limits: { liveTradingEnabled: config.LIVE_TRADING_ENABLED, hardMaxOrderUsd: config.LIVE_MAX_ORDER_USD },
  hasLiveAccess: async (userId) => (await credentials.get(userId)) !== null,
  async gatewayFor(play) {
    if (play.mode === "ghost") return ghost;
    const cred = await credentials.get(play.userId);
    if (!cred) throw new Error("live Play without a connected key");
    const key = { keyId: cred.keyId, secret: decryptSecret(cred.secretCiphertext, config.CREDENTIALS_SECRET) };
    return new CoinbaseGateway(run, key, cred.portfolioUuid);
  },
  log: { info: (o, m) => log.info(o, m), warn: (o, m) => log.warn(o, m), error: (o, m) => log.error(o, m) },
});

const app = buildServer(
  {
    verifyToken: supabaseVerifier(db),
    run,
    credentials,
    market,
    runtime,
    words: config.ANTHROPIC_API_KEY
      ? {
          drafter: new Drafter({ model: config.DRAFT_MODEL, market }),
          deck: supabaseDeckStore(db),
          holdingsOf: async (userId) => `Ghost cash $${(await plays.ghostCashUsd(userId)).toFixed(2)}`,
          rigFor: (userId) => rigs.get(userId),
        }
      : undefined,
    me: { plays, liveTradingEnabled: config.LIVE_TRADING_ENABLED },
    rig: {
      rigs,
      plays,
      async keyFor(userId) {
        const cred = await credentials.get(userId);
        if (!cred) return null;
        return { key: { keyId: cred.keyId, secret: decryptSecret(cred.secretCiphertext, config.CREDENTIALS_SECRET) }, portfolioUuid: cred.portfolioUuid };
      },
    },
    credentialsSecret: config.CREDENTIALS_SECRET,
    harnessTokens: supabaseHarnessTokenStore(db),
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
  },
  {
    logger: {
      level: config.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.body"],
    },
  },
);

log = app.log;
app.log.info(
  { liveTradingEnabled: config.LIVE_TRADING_ENABLED, liveMaxOrderUsd: config.LIVE_MAX_ORDER_USD, brain: brain.name, x402Evidence: config.X402_EVIDENCE_ENABLED },
  "engine config",
);

runtime
  .start()
  .then(() => app.listen({ port: config.PORT, host: config.HOST }))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    runtime.stop();
    app.close().finally(() => process.exit(0));
  });
}
