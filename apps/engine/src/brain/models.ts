// Model choices and per-model request options, in one place.
//
// Decisions: Sonnet 5.5. Drafting and the Deck: Haiku 5.5. (The user's call,
// 2026-10-24, over the Opus 5.5 default: faster and cheaper for these.)
// Both are overridable with BRAIN_MODEL / DRAFT_MODEL.

export const DEFAULT_BRAIN_MODEL = "claude-sonnet-5-5";
export const DEFAULT_DRAFT_MODEL = "claude-haiku-5-5";

/**
 * Server-side refusal fallbacks exist for Opus 5.5 / 5, Sonnet 5.5 and Fable;
 * Haiku 5.5 has none, so the parameter is only sent where it's accepted.
 */
export function fallbackOptions(model: string): { betas?: ["server-side-fallback-2026-07-01"]; fallbacks?: "default" } {
  const supported = /^claude-(opus-5(-5)?|sonnet-5-5|fable-5(-1)?)$/.test(model);
  return supported ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
}
