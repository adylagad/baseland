import { z } from "zod";
import { CoinbaseCliError, type CliRunner, type CoinbaseKey } from "../coinbase/cli.js";
import type { MarketData } from "../market/public.js";

// Where orders go. The Play runtime picks one gateway per Play by its mode and
// never branches on Ghost anywhere else (ARCHITECTURE.md: Ghost is a gateway).

export interface OrderRequest {
  side: "BUY" | "SELL";
  product: string;
  /** Market BUY spend in quote currency. */
  quoteSize?: string;
  /** Market SELL size in base currency. */
  baseSize?: string;
  /** Idempotency key: the same key never creates a second order. */
  clientOrderId: string;
  /** Exchange-held exits attached to a BUY (live only). */
  attachedTakeProfitPrice?: string;
  attachedStopLossPrice?: string;
}

export interface Preview {
  estAvgPrice: number | null;
  estFeeUsd: number | null;
  /** Total cost (BUY) or proceeds (SELL) in USD, when Coinbase says. */
  estTotalUsd: number | null;
  warning: string | null;
}

export type OrderState = "open" | "filled" | "cancelled" | "failed";

export interface OrderStatus {
  orderId: string;
  state: OrderState;
  filledBase: number;
  avgPrice: number | null;
  feeUsd: number;
}

export interface TradingGateway {
  readonly simulated: boolean;
  /** null when the venue cannot preview this order; live Plays then refuse to trade. */
  preview(req: OrderRequest): Promise<Preview | null>;
  place(req: OrderRequest): Promise<{ orderId: string }>;
  status(orderId: string): Promise<OrderStatus>;
}

export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayError";
  }
}

// ---------------------------------------------------------------- Ghost

/** Coinbase Advanced's Intro taker fee, so Ghost P&L is realistic. */
export const GHOST_TAKER_FEE = 0.009;

/**
 * Fills market orders instantly at the current public price, with the taker
 * fee. In memory only: Ghost fills are made durable by the Tape, which the
 * runtime writes in the same step.
 */
export class GhostGateway implements TradingGateway {
  readonly simulated = true;
  private orders = new Map<string, OrderStatus>();
  private byClientId = new Map<string, string>();

  constructor(
    private readonly market: MarketData,
    private readonly feeRate = GHOST_TAKER_FEE,
  ) {}

  async preview(req: OrderRequest): Promise<Preview> {
    const { price } = await this.market.quote(req.product);
    const value = req.quoteSize ? Number(req.quoteSize) : Number(req.baseSize) * price;
    const fee = value * this.feeRate;
    return {
      estAvgPrice: price,
      estFeeUsd: round(fee),
      estTotalUsd: round(req.side === "BUY" ? value : value - fee),
      warning: null,
    };
  }

  async place(req: OrderRequest) {
    const existing = this.byClientId.get(req.clientOrderId);
    if (existing) return { orderId: existing };

    const { price } = await this.market.quote(req.product);
    let base: number;
    let fee: number;
    if (req.side === "BUY") {
      // Coinbase market BUYs spend quote_size including the fee.
      const spend = Number(req.quoteSize);
      fee = spend * this.feeRate;
      base = (spend - fee) / price;
    } else {
      base = Number(req.baseSize);
      fee = base * price * this.feeRate;
    }
    const orderId = `ghost-${req.clientOrderId}`;
    this.orders.set(orderId, { orderId, state: "filled", filledBase: base, avgPrice: price, feeUsd: round(fee) });
    this.byClientId.set(req.clientOrderId, orderId);
    return { orderId };
  }

  async status(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o) throw new GatewayError(`unknown ghost order ${orderId}`);
    return o;
  }
}

// ------------------------------------------------------------- Coinbase

const PreviewResponse = z.object({
  order_total: z.string().optional(),
  commission_total: z.string().optional(),
  est_average_filled_price: z.string().optional(),
  warning: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  errs: z.array(z.unknown()).optional(),
  preview_failure_reason: z.string().optional(),
});

const OrderBody = z.object({
  order_id: z.string(),
  status: z.string(),
  filled_size: z.string().optional(),
  average_filled_price: z.string().optional(),
  total_fees: z.string().optional(),
});

/** Real orders through the `coinbase` CLI, in the key's one portfolio. */
export class CoinbaseGateway implements TradingGateway {
  readonly simulated = false;

  constructor(
    private readonly run: CliRunner,
    private readonly key: CoinbaseKey,
    private readonly portfolioId: string,
  ) {}

  async preview(req: OrderRequest): Promise<Preview | null> {
    let raw: unknown;
    try {
      raw = await this.run(["orders", "preview", ...this.fields(req, false)], this.key);
    } catch (err) {
      if (err instanceof CoinbaseCliError) return null;
      throw err;
    }
    const p = PreviewResponse.safeParse(raw);
    if (!p.success || p.data.preview_failure_reason || (p.data.errs && p.data.errs.length)) return null;
    const warning = Array.isArray(p.data.warning) ? p.data.warning.join("; ") || null : (p.data.warning ?? null);
    return {
      estAvgPrice: num(p.data.est_average_filled_price),
      estFeeUsd: num(p.data.commission_total),
      estTotalUsd: num(p.data.order_total),
      warning,
    };
  }

  async place(req: OrderRequest) {
    const raw = (await this.run(["orders", "create", ...this.fields(req, true)], this.key)) as Record<string, unknown>;
    const success = (raw?.success_response ?? raw) as Record<string, unknown>;
    if (raw?.success === false || typeof success?.order_id !== "string") {
      const reason = (raw?.error_response as Record<string, unknown> | undefined)?.message ?? raw?.failure_reason;
      throw new GatewayError(`Coinbase did not accept the order${reason ? `: ${String(reason)}` : ""}`);
    }
    return { orderId: success.order_id };
  }

  async status(orderId: string): Promise<OrderStatus> {
    const raw = (await this.run(["orders", "get", orderId], this.key)) as Record<string, unknown>;
    const o = OrderBody.parse(raw?.order ?? raw);
    return {
      orderId: o.order_id,
      state: mapStatus(o.status),
      filledBase: num(o.filled_size) ?? 0,
      avgPrice: num(o.average_filled_price),
      feeUsd: num(o.total_fees) ?? 0,
    };
  }

  private fields(req: OrderRequest, create: boolean): string[] {
    const f = [`product_id=${req.product}`, `side=${req.side}`, "type=market", `portfolio_id=${this.portfolioId}`];
    if (req.quoteSize) f.push(`quote_size=${req.quoteSize}`);
    if (req.baseSize) f.push(`base_size=${req.baseSize}`);
    if (req.attachedTakeProfitPrice) f.push(`attached_take_profit_price=${req.attachedTakeProfitPrice}`);
    if (req.attachedStopLossPrice) f.push(`attached_stop_loss_price=${req.attachedStopLossPrice}`);
    if (create) f.push(`client_order_id=${req.clientOrderId}`);
    return f;
  }
}

export function mapStatus(s: string): OrderState {
  switch (s.toUpperCase()) {
    case "FILLED":
      return "filled";
    case "CANCELLED":
    case "EXPIRED":
      return "cancelled";
    case "FAILED":
      return "failed";
    default:
      // OPEN, PENDING, QUEUED, CANCEL_QUEUED, UNKNOWN_ORDER_STATUS: keep polling.
      return "open";
  }
}

const num = (s: string | undefined | null) => (s === undefined || s === null || s === "" ? null : Number(s));
const round = (x: number) => Math.round(x * 1e6) / 1e6;
