import type { SupabaseClient } from "@supabase/supabase-js";

// Ciphertext only. Plaintext secrets never reach this layer's storage.
export interface StoredCredential {
  userId: string;
  keyId: string;
  secretCiphertext: string;
  portfolioUuid: string;
  portfolioName: string;
  verifiedAt: string;
}

export interface CredentialStore {
  get(userId: string): Promise<StoredCredential | null>;
  put(cred: StoredCredential): Promise<void>;
  remove(userId: string): Promise<void>;
}

export function supabaseCredentialStore(db: SupabaseClient): CredentialStore {
  return {
    async get(userId) {
      const { data, error } = await db
        .from("credentials")
        .select("user_id, key_id, secret_ciphertext, portfolio_uuid, portfolio_name, verified_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`credentials read failed: ${error.message}`);
      if (!data) return null;
      return {
        userId: data.user_id,
        keyId: data.key_id,
        secretCiphertext: data.secret_ciphertext,
        portfolioUuid: data.portfolio_uuid,
        portfolioName: data.portfolio_name,
        verifiedAt: data.verified_at,
      };
    },
    async put(c) {
      const { error } = await db.from("credentials").upsert({
        user_id: c.userId,
        key_id: c.keyId,
        secret_ciphertext: c.secretCiphertext,
        portfolio_uuid: c.portfolioUuid,
        portfolio_name: c.portfolioName,
        verified_at: c.verifiedAt,
      });
      if (error) throw new Error(`credentials write failed: ${error.message}`);
    },
    async remove(userId) {
      const { error } = await db.from("credentials").delete().eq("user_id", userId);
      if (error) throw new Error(`credentials delete failed: ${error.message}`);
    },
  };
}

export function memoryCredentialStore(): CredentialStore & { rows: Map<string, StoredCredential> } {
  const rows = new Map<string, StoredCredential>();
  return {
    rows,
    async get(userId) {
      return rows.get(userId) ?? null;
    },
    async put(c) {
      rows.set(c.userId, c);
    },
    async remove(userId) {
      rows.delete(userId);
    },
  };
}
