import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HARNESS_PREFIX } from "./harness/tokens.js";

// Resolves a request's bearer token to a user id, or null.
export type VerifyToken = (token: string) => Promise<string | null>;

/**
 * getClaims verifies the JWT signature (via JWKS for asymmetric keys). Never
 * getSession(), which trusts whatever token it is handed.
 */
export function supabaseVerifier(db: SupabaseClient): VerifyToken {
  return async (token) => {
    const { data, error } = await db.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    /** "harness" when the caller used a harness token (the Baseland MCP). */
    via: "app" | "harness";
  }
  interface FastifyContextConfig {
    /** The route also accepts harness tokens. Every other route refuses them. */
    harness?: boolean;
  }
}

export function requireUser(verify: VerifyToken, verifyHarness?: VerifyToken) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token?.startsWith(HARNESS_PREFIX)) {
      // Default deny: a harness token only opens routes marked for it.
      if (!req.routeOptions.config.harness) {
        return reply.code(403).send({ error: "Only the Baseland app can do this; a harness token can't." });
      }
      const userId = verifyHarness ? await verifyHarness(token).catch(() => null) : null;
      if (!userId) return reply.code(401).send({ error: "unauthorized" });
      req.userId = userId;
      req.via = "harness";
      return;
    }
    const userId = token ? await verify(token).catch(() => null) : null;
    if (!userId) return reply.code(401).send({ error: "unauthorized" });
    req.userId = userId;
    req.via = "app";
  };
}
