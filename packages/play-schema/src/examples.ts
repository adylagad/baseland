import type { CartridgeInput } from "./index.js";

// Reference cartridges: used by tests, the demo, and as templates. Each one
// must parse (see test/schema.test.ts).

export const ethBreakout: CartridgeInput = {
  version: 1,
  title: "ETH breakout",
  sentence: [
    { kind: "text", text: "If " },
    { kind: "chip", id: "product", field: "trigger.product", label: "ETH" },
    { kind: "text", text: " breaks " },
    { kind: "chip", id: "level", field: "trigger.price", label: "$2,400" },
    { kind: "text", text: " in the next " },
    { kind: "chip", id: "window", field: "window.lastsMin", label: "6h" },
    { kind: "text", text: ", buy " },
    { kind: "chip", id: "amount", field: "action.quoteUsd", label: "$3" },
    { kind: "text", text: ". Take profit at " },
    { kind: "chip", id: "tp", field: "exit.takeProfitPct", label: "+4%" },
    { kind: "text", text: ", stop at " },
    { kind: "chip", id: "sl", field: "exit.stopLossPct", label: "−2%" },
    { kind: "text", text: "." },
  ],
  window: { startsInMin: 0, lastsMin: 360 },
  trigger: { kind: "price_cross", product: "ETH-USDC", direction: "above", price: 2400 },
  evidence: { senses: ["exa.news", "nansen.flows"], budgetUsdc: 0.1 },
  decision: { instinct: "momentum", ask: "always" },
  action: { side: "BUY", product: "ETH-USDC", quoteUsd: 3 },
  exit: { takeProfitPct: 4, stopLossPct: 2 },
  leash: { maxOrderUsd: 5, maxPlayUsd: 5, maxEvidenceUsdc: 0.1, allowedProducts: ["ETH-USDC"] },
};

export const btcDip: CartridgeInput = {
  version: 1,
  title: "Buy the BTC dip",
  sentence: [
    { kind: "text", text: "If " },
    { kind: "chip", id: "product", field: "trigger.product", label: "BTC" },
    { kind: "text", text: " drops " },
    { kind: "chip", id: "pct", field: "trigger.pct", label: "3%" },
    { kind: "text", text: " today, buy " },
    { kind: "chip", id: "amount", field: "action.quoteUsd", label: "$5" },
    { kind: "text", text: "." },
  ],
  window: { lastsMin: 24 * 60 },
  trigger: { kind: "pct_move", product: "BTC-USDC", direction: "down", pct: 3 },
  action: { side: "BUY", product: "BTC-USDC", quoteUsd: 5 },
  leash: { maxOrderUsd: 5, maxPlayUsd: 5 },
};

/** Equities trade in market hours only; this one is meant for Ghost / Replay. */
export const nvdaEarnings: CartridgeInput = {
  version: 1,
  title: "NVDA earnings beat",
  sentence: [
    { kind: "text", text: "When " },
    { kind: "chip", id: "product", field: "action.product", label: "NVDA" },
    { kind: "text", text: " reports, if it jumps " },
    { kind: "chip", id: "pct", field: "trigger.pct", label: "4%" },
    { kind: "text", text: ", buy " },
    { kind: "chip", id: "amount", field: "action.quoteUsd", label: "$25" },
    { kind: "text", text: "." },
  ],
  window: { startsInMin: 0, lastsMin: 120 },
  trigger: { kind: "pct_move", product: "NVDA-USD", direction: "up", pct: 4 },
  evidence: { senses: ["massive.stocks", "exa.news"], budgetUsdc: 0.1 },
  action: { side: "BUY", product: "NVDA-USD", quoteUsd: 25 },
  exit: { stopLossPct: 6 },
  leash: { maxOrderUsd: 25, maxPlayUsd: 25 },
};

/** Fires straight away: the simplest Play, used to test the pipeline. */
export const ethNow: CartridgeInput = {
  version: 1,
  title: "Buy ETH now",
  sentence: [
    { kind: "text", text: "Buy " },
    { kind: "chip", id: "amount", field: "action.quoteUsd", label: "$2" },
    { kind: "text", text: " of ETH now." },
  ],
  window: { lastsMin: 30 },
  trigger: { kind: "time", afterMin: 0 },
  action: { side: "BUY", product: "ETH-USDC", quoteUsd: 2 },
  leash: { maxOrderUsd: 2, maxPlayUsd: 2 },
};

export const examples = { ethBreakout, btcDip, nvdaEarnings, ethNow };
