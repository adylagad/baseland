import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";

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
  }
}

export function requireUser(verify: VerifyToken) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const userId = token ? await verify(token).catch(() => null) : null;
    if (!userId) return reply.code(401).send({ error: "unauthorized" });
    req.userId = userId;
  };
}
