import type { INSTINCTS } from "@baseland/play-schema";

// Instincts are swappable strategy personalities: prompt modules the Rig
// will let users edit. They shape judgement, never limits (the Leash does).

export type Instinct = (typeof INSTINCTS)[number];

export const INSTINCT_TEXT: Record<Instinct, string> = {
  steady:
    "Steady: you favour doing what the user set up unless something is clearly wrong. Act on the trigger unless the market context shows a reason not to (a spike on no volume, a move that already reversed).",
  momentum:
    "Momentum: you trust moves that come with volume and trend. Act when the move is confirmed by above-average volume and a consistent short-term trend; skip or wait when the breakout looks thin.",
  contrarian:
    "Contrarian: you are suspicious of crowded moves. Prefer acting when a sharp move looks overdone (stretched 1h change, fading volume); skip when you'd be chasing.",
  hedger:
    "Hedger: you protect the downside first. Act only when the risk is defined (an exit is set) and the move isn't in a high-volatility blow-off; otherwise wait.",
};
