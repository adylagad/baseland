import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { Cartridge, cartridgeFromDraft, defaultRig, Draft, type Rig } from "@baseland/play-schema";
import { senseById } from "./senses.js";
import { MarketError, type MarketData } from "../market/public.js";
import { DEFAULT_DRAFT_MODEL, fallbackOptions } from "./models.js";

// Turns words into Plays: a sentence the user typed or said, or a Deck of
// suggestions written from live prices. The model only ever writes Drafts;
// product ids come from Coinbase lookups and cartridges from code.

export class DraftError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DraftError";
  }
}

export const DECK_PRODUCTS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "LINK", "AVAX", "ADA"] as const;

export interface DrafterOptions {
  client?: Anthropic;
  model?: string;
  market: MarketData;
}

const DeckOutput = z.object({ cards: z.array(Draft.extend({ rationale: z.string().describe("One sentence: why this Play, now") })) });

export interface DeckCardDraft {
  cartridge: Cartridge;
  rationale: string;
}

export class Drafter {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly market: MarketData;

  constructor(opts: DrafterOptions) {
    this.client = opts.client ?? new Anthropic({ timeout: 45_000, maxRetries: 1 });
    this.model = opts.model ?? DEFAULT_DRAFT_MODEL;
    this.market = opts.market;
  }

  /** "buy 5 bucks of eth if it breaks 2400" → a valid cartridge. */
  async fromSentence(text: string, rig: Rig = defaultRig()): Promise<Cartridge> {
    const snapshot = await this.snapshot(rig.hands.assets);
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 8000,
      output_config: { effort: "low", format: betaZodOutputFormat(Draft) },
      ...fallbackOptions(this.model),
      system: DRAFT_SYSTEM,
      messages: [{ role: "user", content: `Live prices:\n${snapshot}\n\nThe person said: ${JSON.stringify(text)}` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new DraftError("Couldn't turn that into a Play. Try naming an asset and an amount.");
    return this.build(res.parsed_output, rig);
  }

  /** Up to `count` suggested Plays from live prices and what the user holds. */
  async deck(opts: { count?: number; holdings?: string; recentTitles?: string[]; rig?: Rig } = {}): Promise<DeckCardDraft[]> {
    const rig = opts.rig ?? defaultRig();
    const snapshot = await this.snapshot(rig.hands.assets);
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 12000,
      output_config: { effort: "low", format: betaZodOutputFormat(DeckOutput) },
      ...fallbackOptions(this.model),
      system: DECK_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Live prices (24h change):\n${snapshot}`,
            `Holdings: ${opts.holdings ?? "none yet"}`,
            `Plays they already ran recently: ${opts.recentTitles?.length ? opts.recentTitles.join("; ") : "none"}`,
            `Only use these assets: ${rig.hands.assets.join(", ")}. Keep every amount at or under $${rig.leash.maxOrderUsd}.`,
            `Write ${opts.count ?? 5} cards.`,
          ].join("\n\n"),
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new DraftError("Couldn't write a Deck right now.");
    const out: DeckCardDraft[] = [];
    for (const card of res.parsed_output.cards) {
      try {
        out.push({ cartridge: await this.build(card, rig), rationale: card.rationale });
      } catch {
        // A card that doesn't resolve or validate is dropped, not shown broken.
      }
    }
    return out;
  }

  /** Draft → resolved product → cartridge (shaped by the Rig) → validated. */
  async build(d: Draft, rig: Rig = defaultRig()): Promise<Cartridge> {
    if (d.assetClass === "stock") {
      throw new DraftError(
        `Stock Plays need live stock prices, which Coinbase doesn't publish while the market is closed. ${d.symbol.toUpperCase()} will work in market hours; crypto works now.`,
      );
    }
    const symbol = d.symbol.toUpperCase();
    if (!rig.hands.assets.includes(symbol)) throw new DraftError(`${symbol} isn't in your Rig's Hands. Add it in the Rig to trade it.`);
    const product = await this.resolveCrypto(symbol);
    const filled: Draft = {
      ...d,
      // Never draft an order the Rig's Leash would refuse.
      amountUsd: d.side === "BUY" ? Math.min(d.amountUsd ?? 5, rig.leash.maxOrderUsd) : null,
      lastsMin: d.lastsMin > 0 ? d.lastsMin : 360,
    };
    const senses = rig.senses.enabled.filter((id) => senseById(id)?.assets !== "stock");
    const built = cartridgeFromDraft(filled, product, { senses, evidenceBudgetUsdc: Math.min(rig.senses.budgetUsdc, rig.leash.maxEvidenceUsdc) });
    // "Don't ask" said out loud wins; otherwise the Rig's approval policy.
    built.decision = { instinct: d.instinct, ask: d.ask === "never" ? "never" : rig.hands.ask };
    const parsed = Cartridge.safeParse(built);
    if (!parsed.success) {
      throw new DraftError("That Play doesn't add up yet.", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    }
    return parsed.data;
  }

  /** Prefers the USDC book, falls back to USD; a product Coinbase doesn't list is an error. */
  async resolveCrypto(symbol: string): Promise<string> {
    const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (const id of [`${sym}-USDC`, `${sym}-USD`]) {
      try {
        await this.market.quote(id);
        return id;
      } catch (err) {
        if (!(err instanceof MarketError && err.status === 404)) throw err;
      }
    }
    throw new DraftError(`Coinbase doesn't list ${sym}.`);
  }

  private async snapshot(assets: readonly string[] = DECK_PRODUCTS): Promise<string> {
    const rows = await Promise.all(
      assets.map(async (s) => {
        try {
          const q = await this.market.quote(`${s}-USDC`);
          return `${s}: $${q.price} (${q.change24hPct !== null ? `${q.change24hPct.toFixed(2)}%` : "n/a"})`;
        } catch {
          return null;
        }
      }),
    );
    return rows.filter(Boolean).join("\n");
  }
}

const DRAFT_SYSTEM = `You turn one sentence into a Baseland Play draft. A Play is a short, event-scoped trading mission.
Fill every field. Rules:
- symbol: the ticker only (ETH, BTC, SOL...). assetClass "stock" for equities like NVDA or AAPL.
- If they name a level ("breaks 2400", "drops under 60k"), use price_cross with above/below.
- If they describe a % move ("dips 3%", "pumps 5%"), use pct_move with up/down/either.
- If they want it now or at a time, use time with afterMin (0 = now).
- If they say "breakout" with no level, pick a level about 1% above the live price; "dip" with no level: pct_move down 3%.
- amountUsd: what they said ("five bucks" = 5). If none, null.
- lastsMin: how long it stays open ("today" = until 24h, "next hour" = 60). Default 360.
- startsInMin: 0 unless they say later.
- Exits only if they mention take profit / stop loss.
- ask: "always" unless they explicitly say not to ask.
- instinct: momentum for breakouts, contrarian for dip-buying, steady otherwise.
- title: 2-5 words.`;

const DECK_SYSTEM = `You write the Play Deck for Baseland: short, event-scoped trading missions a person can arm with one swipe.
Write varied, sensible cards from the live prices you're given:
- a breakout (price_cross above, ~1-2% above the live price) on whatever is moving,
- a dip-buy (pct_move down 2-4%) on a major asset,
- a momentum or contrarian idea based on the 24h moves,
- a small buy-now (time, afterMin 0) only if it makes sense,
- a take-profit style card only if they hold something.
Amounts small: $2-$10. Windows 1-24 hours. Exits on breakouts (take profit 3-6%, stop 1.5-3%). ask "always".
Crypto only (assetClass "crypto"). Each rationale: one plain sentence about why now, citing the numbers.`;
