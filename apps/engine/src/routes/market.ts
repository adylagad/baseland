import type { FastifyInstance } from "fastify";
import { MarketError, type MarketData } from "../market/public.js";

const PRODUCT_ID = /^[A-Z0-9]{1,12}-[A-Z0-9]{2,6}$/;

export function marketRoutes(app: FastifyInstance, market: MarketData) {
  app.get<{ Params: { productId: string } }>("/v1/market/:productId", async (req, reply) => {
    const productId = req.params.productId.toUpperCase();
    if (!PRODUCT_ID.test(productId)) return reply.code(400).send({ error: "bad product id" });
    try {
      return await market.quote(productId);
    } catch (err) {
      if (err instanceof MarketError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });
}
