import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { hashHarnessToken, mintHarnessToken, type HarnessTokenStore } from "../harness/tokens.js";

// Connecting a harness (the Baseland MCP in Claude Code). App only: a harness
// token can't mint, read or revoke tokens.
export function harnessRoutes(app: FastifyInstance, d: { auth: preHandlerHookHandler; tokens: HarnessTokenStore }) {
  app.get("/v1/harness", { preHandler: d.auth }, async (req) => {
    const info = await d.tokens.info(req.userId);
    return info ? { connected: true, ...info } : { connected: false };
  });

  /** Mints a token, shown only in this response. Replaces any earlier one. */
  app.post("/v1/harness", { preHandler: d.auth }, async (req, reply) => {
    const token = mintHarnessToken();
    const info = await d.tokens.replace(req.userId, hashHarnessToken(token));
    return reply.code(201).send({ token, connected: true, ...info });
  });

  app.delete("/v1/harness", { preHandler: d.auth }, async (req) => {
    await d.tokens.remove(req.userId);
    return { connected: false };
  });
}
