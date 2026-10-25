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
  // Needed from Phase 2 (the Brain); optional so the engine boots without it.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
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
