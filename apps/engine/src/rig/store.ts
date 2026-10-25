import type { SupabaseClient } from "@supabase/supabase-js";
import { Rig, defaultRig } from "@baseland/play-schema";

/** One Rig per user, in profiles.rig. A missing or stale Rig reads as defaults. */
export interface RigStore {
  get(userId: string): Promise<Rig>;
  put(userId: string, rig: Rig): Promise<Rig>;
}

const parse = (raw: unknown): Rig => {
  const r = Rig.safeParse(raw ?? {});
  return r.success ? r.data : defaultRig();
};

export function memoryRigStore(): RigStore & { rigs: Map<string, Rig> } {
  const rigs = new Map<string, Rig>();
  return {
    rigs,
    async get(userId) {
      return parse(rigs.get(userId));
    },
    async put(userId, rig) {
      rigs.set(userId, rig);
      return rig;
    },
  };
}

export function supabaseRigStore(db: SupabaseClient): RigStore {
  return {
    async get(userId) {
      const { data, error } = await db.from("profiles").select("rig").eq("user_id", userId).maybeSingle();
      if (error) throw new Error(`read rig failed: ${error.message}`);
      return parse(data?.rig);
    },
    async put(userId, rig) {
      const { error } = await db.from("profiles").update({ rig }).eq("user_id", userId);
      if (error) throw new Error(`write rig failed: ${error.message}`);
      return rig;
    },
  };
}
