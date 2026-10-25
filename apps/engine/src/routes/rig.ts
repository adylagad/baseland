import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { BRAIN_MODELS, Cartridge, Rig, RIG_ASSETS, symbolOf } from "@baseland/play-schema";
import { accessiblePortfolios } from "../coinbase/account.js";
import type { CliRunner, CoinbaseKey } from "../coinbase/cli.js";
import { INSTINCT_TEXT } from "../brain/instincts.js";
import { SENSES } from "../brain/senses.js";
import type { CredentialStore } from "../credentials/store.js";
import type { MarketData } from "../market/public.js";
import { ledgerOf } from "../plays/ledger.js";
import type { PlayStore } from "../plays/store.js";
import type { RigStore } from "../rig/store.js";
import { publicCandles, replay, ReplayError, type CandleSource } from "../replay.js";

// The Rig (advanced mode): edit how the agent is put together, see the
// account, replay a Play against real past prices.

export interface RigRouteDeps {
  auth: preHandlerHookHandler;
  rigs: RigStore;
  plays: Pick<PlayStore, "ghostCashUsd" | "fillsForUser">;
  market: MarketData;
  credentials: CredentialStore;
  run: CliRunner;
  /** Decrypts a stored key; absent in tests that don't touch live accounts. */
  keyFor?(userId: string): Promise<{ key: CoinbaseKey; portfolioUuid: string } | null>;
  candles?: CandleSource;
}

const MODEL_INFO: Record<(typeof BRAIN_MODELS)[number], string> = {
  "claude-sonnet-5-5": "Sonnet 5.5 · balanced (default)",
  "claude-opus-5-5": "Opus 5.5 · most careful, slower",
  "claude-haiku-5-5": "Haiku 5.5 · fastest, cheapest",
  rules: "Rules only · no AI, acts on every trigger",
};

export function rigRoutes(app: FastifyInstance, d: RigRouteDeps) {
  app.get("/v1/rig", { preHandler: d.auth }, async (req) => ({
    rig: await d.rigs.get(req.userId),
    catalog: {
      models: BRAIN_MODELS.map((id) => ({ id, label: MODEL_INFO[id] })),
      senses: SENSES.map(({ id, label, provider, use, assets, priceUsdc }) => ({ id, label, provider, use, assets, priceUsdc })),
      instincts: Object.entries(INSTINCT_TEXT).map(([id, text]) => ({ id, text })),
      assets: RIG_ASSETS,
    },
  }));

  app.put("/v1/rig", { preHandler: d.auth }, async (req, reply) => {
    const body = z.object({ rig: z.unknown() }).safeParse(req.body);
    const parsed = Rig.safeParse(body.success ? body.data.rig : undefined);
    if (!parsed.success) {
      return reply.code(400).send({ error: "That Rig doesn't fit.", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    const unknownSenses = parsed.data.senses.enabled.filter((id) => !SENSES.some((s) => s.id === id));
    if (unknownSenses.length) return reply.code(400).send({ error: `Unknown sense: ${unknownSenses.join(", ")}` });
    return { rig: await d.rigs.put(req.userId, parsed.data) };
  });

  app.get("/v1/account", { preHandler: d.auth }, async (req) => {
    // Ghost: cash and positions derived from simulated fills.
    const fills = await d.plays.fillsForUser(req.userId, true);
    const byProduct = new Map<string, typeof fills>();
    for (const f of fills) byProduct.set(f.product, [...(byProduct.get(f.product) ?? []), f]);
    const positions = [];
    for (const [product, fs] of byProduct) {
      const l = ledgerOf(fs);
      if (l.positionBase <= 1e-12) continue;
      const price = await d.market.quote(product).then((q) => q.price).catch(() => null);
      positions.push({
        product,
        symbol: symbolOf(product),
        base: l.positionBase,
        avgPrice: l.entryPrice,
        valueUsd: price !== null ? round2(l.positionBase * price) : null,
        pnlUsd: price !== null && l.entryPrice !== null ? round2(l.positionBase * (price - l.entryPrice)) : null,
      });
    }
    const ghost = { cashUsd: await d.plays.ghostCashUsd(req.userId), positions, simulated: true };

    // Live: only what the connected key can see; best effort.
    const cred = await d.credentials.get(req.userId);
    let live: Record<string, unknown> | null = null;
    if (cred) {
      live = { connected: true, portfolio: { uuid: cred.portfolioUuid, name: cred.portfolioName } };
      const k = await d.keyFor?.(req.userId);
      if (k) {
        const [portfolio, fees, orders] = await Promise.all([
          accessiblePortfolios(d.run, k.key).then((ps) => ps[0] ?? null).catch(() => null),
          d.run(["fees"], k.key).catch(() => null),
          d.run(["orders", "list", `portfolio_id=${k.portfolioUuid}`, "limit==20"], k.key).catch(() => null),
        ]);
        const openOrders = ((orders as { orders?: { status?: string }[] } | null)?.orders ?? []).filter((o) => o.status === "OPEN");
        live = { ...live, balances: portfolio?.portfolio_balances ?? null, fees, openOrders };
      }
    }
    return { ghost, live };
  });

  app.post("/v1/replay", { preHandler: d.auth }, async (req, reply) => {
    const body = z.object({ cartridge: z.unknown(), days: z.number().min(0.25).max(7).default(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "expected { cartridge, days }" });
    const spec = Cartridge.safeParse(body.data.cartridge);
    if (!spec.success) return reply.code(400).send({ error: "invalid cartridge", details: spec.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    try {
      return await replay(spec.data, { days: body.data.days, candles: d.candles ?? publicCandles() });
    } catch (err) {
      if (err instanceof ReplayError) return reply.code(422).send({ error: err.message });
      throw err;
    }
  });
}

const round2 = (x: number) => Math.round(x * 100) / 100;
