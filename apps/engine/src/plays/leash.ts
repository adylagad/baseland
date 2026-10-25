import type { Leash } from "@baseland/play-schema";

// The Leash: hard limits checked by the engine before every order, after the
// Brain has spoken and before anything reaches a gateway. The model never
// sees or bypasses this (AGENTS.md hard rules 2 and 3).

export interface OrderIntent {
  purpose: "entry" | "exit";
  side: "BUY" | "SELL";
  product: string;
  /** Market BUY spend. */
  quoteUsd?: number;
  /** Market SELL size. */
  baseSize?: number;
  /** Best estimate of the order's USD value (preview, or quote × size). */
  estUsd: number;
}

export interface LeashContext {
  /** Already spent by this Play on orders (from the Ledger). */
  playSpentUsd: number;
  /** Open position this Play holds, for exits. */
  playPositionBase: number;
  /** Engine-wide ceiling on any single live order; Infinity for Ghost. */
  hardMaxOrderUsd: number;
  /** Cash available to this mode, when known (Ghost always knows). */
  availableUsd?: number;
}

export type LeashVerdict = { ok: true } | { ok: false; reason: string };

const usd = (x: number) => `$${x.toFixed(2)}`;

export function checkOrder(o: OrderIntent, leash: Leash, ctx: LeashContext): LeashVerdict {
  const no = (reason: string): LeashVerdict => ({ ok: false, reason });

  if (leash.allowedProducts && !leash.allowedProducts.includes(o.product)) {
    return no(`${o.product} is not on this Play's allowed list`);
  }

  if (o.purpose === "exit") {
    // Exits only ever reduce what this Play itself bought.
    if (o.side !== "SELL") return no("exits can only sell");
    if (!o.baseSize || o.baseSize <= 0) return no("nothing to sell");
    if (o.baseSize > ctx.playPositionBase + 1e-12) return no("exit is larger than the position this Play holds");
    return { ok: true };
  }

  const amount = o.side === "BUY" ? (o.quoteUsd ?? o.estUsd) : o.estUsd;
  if (!(amount > 0)) return no("order has no size");
  if (amount > leash.maxOrderUsd + 1e-9) return no(`${usd(amount)} is over the ${usd(leash.maxOrderUsd)} order limit`);
  if (amount > ctx.hardMaxOrderUsd + 1e-9) {
    return no(`${usd(amount)} is over the engine's ${usd(ctx.hardMaxOrderUsd)} live-order ceiling`);
  }
  if (o.side === "BUY") {
    if (ctx.playSpentUsd + amount > leash.maxPlayUsd + 1e-9) {
      return no(`would bring this Play to ${usd(ctx.playSpentUsd + amount)}, over its ${usd(leash.maxPlayUsd)} limit`);
    }
    if (ctx.availableUsd !== undefined && amount > ctx.availableUsd + 1e-9) {
      return no(`only ${usd(ctx.availableUsd)} available`);
    }
  }
  return { ok: true };
}
