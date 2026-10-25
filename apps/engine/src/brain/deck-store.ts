import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cartridge } from "@baseland/play-schema";

export interface DeckCard {
  id: string;
  userId: string;
  title: string;
  sentence: Cartridge["sentence"];
  spec: Cartridge;
  rationale: string;
  status: "suggested" | "armed" | "skipped";
  createdAt: string;
}

export interface DeckStore {
  /** Suggested cards newer than `sinceIso`, newest first. */
  fresh(userId: string, sinceIso: string): Promise<DeckCard[]>;
  /** Replaces the user's suggested cards with these. */
  replace(userId: string, cards: Pick<DeckCard, "spec" | "rationale">[]): Promise<DeckCard[]>;
  get(id: string): Promise<DeckCard | null>;
  setStatus(id: string, status: DeckCard["status"]): Promise<void>;
}

export function memoryDeckStore(): DeckStore & { cards: Map<string, DeckCard> } {
  const cards = new Map<string, DeckCard>();
  return {
    cards,
    async fresh(userId, since) {
      return [...cards.values()].filter((c) => c.userId === userId && c.status === "suggested" && c.createdAt >= since).reverse();
    },
    async replace(userId, next) {
      for (const [id, c] of cards) if (c.userId === userId && c.status === "suggested") cards.delete(id);
      const now = new Date().toISOString();
      const made = next.map((n) => ({ id: randomUUID(), userId, title: n.spec.title, sentence: n.spec.sentence, spec: n.spec, rationale: n.rationale, status: "suggested" as const, createdAt: now }));
      for (const c of made) cards.set(c.id, c);
      return made;
    },
    async get(id) {
      return cards.get(id) ?? null;
    },
    async setStatus(id, status) {
      const c = cards.get(id);
      if (c) c.status = status;
    },
  };
}

type Row = { id: string; user_id: string; title: string; sentence: Cartridge["sentence"]; spec: Cartridge; rationale: string; status: DeckCard["status"]; created_at: string };
const fromRow = (r: Row): DeckCard => ({ id: r.id, userId: r.user_id, title: r.title, sentence: r.sentence, spec: r.spec, rationale: r.rationale, status: r.status, createdAt: r.created_at });

export function supabaseDeckStore(db: SupabaseClient): DeckStore {
  const fail = (what: string, e: { message: string }) => new Error(`${what} failed: ${e.message}`);
  return {
    async fresh(userId, since) {
      const { data, error } = await db.from("deck_cards").select().eq("user_id", userId).eq("status", "suggested").gte("created_at", since).order("created_at", { ascending: false });
      if (error) throw fail("read deck", error);
      return (data as Row[]).map(fromRow);
    },
    async replace(userId, next) {
      const { error: de } = await db.from("deck_cards").delete().eq("user_id", userId).eq("status", "suggested");
      if (de) throw fail("clear deck", de);
      if (!next.length) return [];
      const { data, error } = await db
        .from("deck_cards")
        .insert(next.map((n) => ({ user_id: userId, title: n.spec.title, sentence: n.spec.sentence, spec: n.spec, rationale: n.rationale })))
        .select();
      if (error) throw fail("write deck", error);
      return (data as Row[]).map(fromRow);
    },
    async get(id) {
      const { data, error } = await db.from("deck_cards").select().eq("id", id).maybeSingle();
      if (error) throw fail("read card", error);
      return data ? fromRow(data as Row) : null;
    },
    async setStatus(id, status) {
      const { error } = await db.from("deck_cards").update({ status }).eq("id", id);
      if (error) throw fail("update card", error);
    },
  };
}
