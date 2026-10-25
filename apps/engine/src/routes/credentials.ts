import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { accessiblePortfolios } from "../coinbase/account.js";
import { CoinbaseCliError, type CliRunner } from "../coinbase/cli.js";
import { encryptSecret } from "../crypto.js";
import type { CredentialStore } from "../credentials/store.js";

// Connecting a Coinbase key. The rules (AGENTS.md hard rules 5 and 6):
// - the key must reach exactly one portfolio, and it must not be the Default
//   portfolio, so the agent can only ever touch money set aside for it;
// - the secret is encrypted before storage and never returned.

// Accept the CDP key file as downloaded ({ id, privateKey }) or explicit fields.
const Body = z.union([
  z.object({ keyId: z.string().min(1), privateKey: z.string().min(1) }),
  z
    .object({ id: z.string().min(1), privateKey: z.string().min(1) })
    .transform((b) => ({ keyId: b.id, privateKey: b.privateKey })),
]);

export interface CredentialRouteDeps {
  auth: preHandlerHookHandler;
  run: CliRunner;
  store: CredentialStore;
  secret: string;
}

export function credentialRoutes(app: FastifyInstance, deps: CredentialRouteDeps) {
  app.get("/v1/credentials", { preHandler: deps.auth }, async (req) => {
    const cred = await deps.store.get(req.userId);
    if (!cred) return { connected: false };
    return {
      connected: true,
      portfolio: { uuid: cred.portfolioUuid, name: cred.portfolioName },
      verifiedAt: cred.verifiedAt,
    };
  });

  app.post("/v1/credentials", { preHandler: deps.auth }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "expected { keyId, privateKey }" });
    const key = { keyId: parsed.data.keyId, secret: parsed.data.privateKey };

    let reachable;
    try {
      reachable = await accessiblePortfolios(deps.run, key);
    } catch (err) {
      if (err instanceof CoinbaseCliError && err.status === 401) {
        return reply.code(400).send({ error: "Coinbase rejected this key (401). Is it a production key?" });
      }
      req.log.error({ err: describe(err) }, "credential verification failed");
      return reply.code(502).send({ error: "could not reach Coinbase to verify the key" });
    }

    if (reachable.length === 0) {
      return reply.code(400).send({ error: "this key cannot access any portfolio" });
    }
    if (reachable.some((p) => p.portfolio.type === "DEFAULT")) {
      return reply.code(400).send({
        error: "this key can access your Default portfolio; scope it to a dedicated portfolio instead",
      });
    }
    if (reachable.length > 1) {
      return reply.code(400).send({ error: "this key reaches more than one portfolio; scope it to one" });
    }

    const portfolio = reachable[0]!.portfolio;
    const verifiedAt = new Date().toISOString();
    await deps.store.put({
      userId: req.userId,
      keyId: key.keyId,
      secretCiphertext: encryptSecret(key.secret, deps.secret),
      portfolioUuid: portfolio.uuid,
      portfolioName: portfolio.name,
      verifiedAt,
    });
    return { connected: true, portfolio: { uuid: portfolio.uuid, name: portfolio.name }, verifiedAt };
  });

  app.delete("/v1/credentials", { preHandler: deps.auth }, async (req) => {
    await deps.store.remove(req.userId);
    return { connected: false };
  });
}

// Log errors without request bodies or keys.
function describe(err: unknown) {
  if (err instanceof CoinbaseCliError) return { message: err.message, status: err.status };
  return { message: err instanceof Error ? err.message : String(err) };
}
