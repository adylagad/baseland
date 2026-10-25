import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { CredentialStore } from "../credentials/store.js";
import type { PlayStore } from "../plays/store.js";

/** What the app needs at launch: Ghost cash, connection, the live switch. */
export function meRoutes(
  app: FastifyInstance,
  d: { auth: preHandlerHookHandler; plays: Pick<PlayStore, "ghostCashUsd">; credentials: CredentialStore; liveTradingEnabled: boolean },
) {
  app.get("/v1/me", { preHandler: d.auth, config: { harness: true } }, async (req) => {
    const [ghostCashUsd, cred] = await Promise.all([d.plays.ghostCashUsd(req.userId), d.credentials.get(req.userId)]);
    return {
      userId: req.userId,
      ghostCashUsd,
      coinbase: cred ? { connected: true, portfolio: { uuid: cred.portfolioUuid, name: cred.portfolioName } } : { connected: false },
      liveTradingEnabled: d.liveTradingEnabled,
      via: req.via,
    };
  });
}
