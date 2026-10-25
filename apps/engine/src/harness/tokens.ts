import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerifyToken } from "../auth.js";

// Harness tokens let the Baseland MCP act for one user (migration
// harness_tokens). The plaintext is shown once; only its hash is stored.

export const HARNESS_PREFIX = "bl_";

export const mintHarnessToken = () => HARNESS_PREFIX + randomBytes(32).toString("base64url");
export const hashHarnessToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface HarnessTokenInfo {
  createdAt: string;
  lastUsedAt: string | null;
}

export interface HarnessTokenStore {
  /** The user a token hash belongs to, recording the use; null if unknown. */
  use(hash: string): Promise<string | null>;
  info(userId: string): Promise<HarnessTokenInfo | null>;
  /** Stores a new hash for the user, revoking any previous token. */
  replace(userId: string, hash: string): Promise<HarnessTokenInfo>;
  remove(userId: string): Promise<void>;
}

export function harnessVerifier(store: HarnessTokenStore): VerifyToken {
  return (token) => store.use(hashHarnessToken(token));
}

export function supabaseHarnessTokenStore(db: SupabaseClient): HarnessTokenStore {
  return {
    async use(hash) {
      const { data, error } = await db
        .from("harness_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("token_hash", hash)
        .select("user_id")
        .maybeSingle();
      if (error) throw new Error(`harness token read failed: ${error.message}`);
      return data?.user_id ?? null;
    },
    async info(userId) {
      const { data, error } = await db
        .from("harness_tokens")
        .select("created_at, last_used_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`harness token read failed: ${error.message}`);
      return data ? { createdAt: data.created_at, lastUsedAt: data.last_used_at } : null;
    },
    async replace(userId, hash) {
      const { data, error } = await db
        .from("harness_tokens")
        .upsert({ user_id: userId, token_hash: hash, created_at: new Date().toISOString(), last_used_at: null })
        .select("created_at, last_used_at")
        .single();
      if (error) throw new Error(`harness token write failed: ${error.message}`);
      return { createdAt: data.created_at, lastUsedAt: data.last_used_at };
    },
    async remove(userId) {
      const { error } = await db.from("harness_tokens").delete().eq("user_id", userId);
      if (error) throw new Error(`harness token delete failed: ${error.message}`);
    },
  };
}

export function memoryHarnessTokenStore(clock: () => number = Date.now): HarnessTokenStore {
  const rows = new Map<string, { hash: string } & HarnessTokenInfo>();
  return {
    async use(hash) {
      for (const [userId, row] of rows) {
        if (row.hash === hash) {
          row.lastUsedAt = new Date(clock()).toISOString();
          return userId;
        }
      }
      return null;
    },
    async info(userId) {
      const row = rows.get(userId);
      return row ? { createdAt: row.createdAt, lastUsedAt: row.lastUsedAt } : null;
    },
    async replace(userId, hash) {
      const row = { hash, createdAt: new Date(clock()).toISOString(), lastUsedAt: null };
      rows.set(userId, row);
      return { createdAt: row.createdAt, lastUsedAt: null };
    },
    async remove(userId) {
      rows.delete(userId);
    },
  };
}
