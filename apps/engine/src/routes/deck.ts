import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { Cartridge, Mode, sentenceFor, type Rig } from "@baseland/play-schema";
import type { DeckStore } from "../brain/deck-store.js";
import { DraftError, type Drafter } from "../brain/drafter.js";
import { PlayError, type PlayRuntime } from "../plays/runtime.js";

// Words → Plays: the Deck of suggestions, the sentence drafter, and chip-edit
// previews. Arming a card goes through the runtime like any other Play.

const DECK_FRESH_MS = 15 * 60_000;

export interface DeckRouteDeps {
  auth: preHandlerHookHandler;
  runtime: PlayRuntime;
  drafter: Pick<Drafter, "fromSentence" | "deck">;
  deck: DeckStore;
  /** Short description of what the user holds, for the Deck prompt. */
  holdingsOf(userId: string): Promise<string>;
  /** The user's Rig; drafts and the Deck follow its Hands, Senses and Leash. */
  rigFor?(userId: string): Promise<Rig>;
  clock?: () => number;
}

export function deckRoutes(app: FastifyInstance, d: DeckRouteDeps) {
  const now = () => (d.clock ?? Date.now)();

  const fail = (reply: FastifyReply, err: unknown) => {
    if (err instanceof DraftError) return reply.code(422).send({ error: err.message, details: err.details });
    if (err instanceof PlayError) return reply.code(err.status).send({ error: err.message, details: err.details });
    throw err;
  };

  app.get<{ Querystring: { refresh?: string } }>("/v1/deck", { preHandler: d.auth }, async (req, reply) => {
    try {
      if (req.query.refresh !== "1") {
        const fresh = await d.deck.fresh(req.userId, new Date(now() - DECK_FRESH_MS).toISOString());
        if (fresh.length) return { cards: fresh };
      }
      const recent = (await d.runtime.list(req.userId)).slice(0, 8).map((p) => p.title);
      const rig = await d.rigFor?.(req.userId);
      const drafts = await d.drafter.deck({ holdings: await d.holdingsOf(req.userId), recentTitles: recent, rig });
      return { cards: await d.deck.replace(req.userId, drafts.map((c) => ({ spec: c.cartridge, rationale: c.rationale }))) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>("/v1/deck/:id/arm", { preHandler: d.auth }, async (req, reply) => {
    const body = z.object({ mode: Mode.default("ghost"), cartridge: z.unknown().optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "expected { mode?, cartridge? }" });
    const card = await d.deck.get(req.params.id);
    if (!card || card.userId !== req.userId) return reply.code(404).send({ error: "No such card." });
    if (card.status !== "suggested") return reply.code(409).send({ error: `This card was already ${card.status}.` });
    try {
      // The app may send the card's cartridge back with chips edited.
      const play = await d.runtime.create(req.userId, body.data.cartridge ?? card.spec, body.data.mode);
      await d.deck.setStatus(card.id, "armed");
      return reply.code(201).send(play);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>("/v1/deck/:id/skip", { preHandler: d.auth }, async (req, reply) => {
    const card = await d.deck.get(req.params.id);
    if (!card || card.userId !== req.userId) return reply.code(404).send({ error: "No such card." });
    await d.deck.setStatus(card.id, "skipped");
    return { skipped: true };
  });

  app.post("/v1/plays/draft", { preHandler: d.auth }, async (req, reply) => {
    const body = z.object({ text: z.string().min(2).max(500) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "expected { text }" });
    try {
      return { cartridge: await d.drafter.fromSentence(body.data.text, await d.rigFor?.(req.userId)) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  /** After a chip edit: validate and regenerate the sentence. No AI involved. */
  app.post("/v1/cartridges/preview", { preHandler: d.auth }, async (req, reply) => {
    const body = z.object({ cartridge: z.unknown() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "expected { cartridge }" });
    const parsed = Cartridge.safeParse(body.data.cartridge);
    if (!parsed.success) {
      return { valid: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    }
    const cartridge = { ...parsed.data, sentence: sentenceFor(parsed.data) };
    return { valid: true, cartridge };
  });
}
