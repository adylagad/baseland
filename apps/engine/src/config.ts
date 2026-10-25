import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // 32 random bytes, base64. Encrypts Coinbase secrets at rest.
  CREDENTIALS_SECRET: z
    .string()
    .refine((s) => Buffer.from(s, "base64").length === 32, "must be 32 bytes, base64-encoded"),
  // Real-money master switch. Off unless set to "true" (AGENTS.md hard rule 1:
  // the user turns it on for Phase 4, nobody else).
  LIVE_TRADING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Real x402 payments for live Plays' evidence (Ghost Plays always simulate).
  // Off unless set to "true"; the user switches it on with live trading.
  X402_EVIDENCE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Ceiling on any single live order, whatever a cartridge says.
  LIVE_MAX_ORDER_USD: z.coerce.number().positive().max(100).default(10),
  // The Brain. Without a key the engine runs on the rules Brain alone.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  BRAIN_MODEL: z.string().default("claude-sonnet-5-5"),
  BRAIN_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  DRAFT_MODEL: z.string().default("claude-haiku-5-5"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // Name the bad variables, never their values.
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid engine configuration:\n  ${fields.join("\n  ")}`);
  }
  return parsed.data;
}
