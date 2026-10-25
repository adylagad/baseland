import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Who the MCP acts as.
//
// - Paired: BASELAND_TOKEN holds a harness token minted in the app (Rig →
//   Account → Connect Claude Code). Plays land on that phone's Island. The
//   engine lets a harness token create Ghost Plays only, and never approve.
// - Anonymous: no token, so the MCP signs in to Supabase anonymously and keeps
//   the session in a local file. A private Ghost account nobody else sees,
//   for trying Baseland without the iPhone app.

// Public values, the same ones the iOS app ships (apps/ios/project.yml).
export const DEFAULTS = {
  engineUrl: "https://baseland-engine.onrender.com",
  supabaseUrl: "https://vxapuqgqvecokhmfmnjl.supabase.co",
  supabaseKey: "sb_publishable_YEnf5ekIBSnOFjKjNT40Ag_-tRYMzkf",
};

export interface Identity {
  kind: "paired" | "anonymous";
  token(): Promise<string>;
}

export function identityFromEnv(env: NodeJS.ProcessEnv = process.env): Identity {
  const harness = env.BASELAND_TOKEN?.trim();
  if (harness) {
    if (!harness.startsWith("bl_")) throw new Error("BASELAND_TOKEN should start with bl_ (copy it from the app's Account screen).");
    return { kind: "paired", token: async () => harness };
  }
  const file = env.BASELAND_SESSION_FILE ?? join(homedir(), ".config", "baseland", "mcp-session.json");
  return anonymousIdentity({
    supabaseUrl: env.BASELAND_SUPABASE_URL ?? DEFAULTS.supabaseUrl,
    supabaseKey: env.BASELAND_SUPABASE_KEY ?? DEFAULTS.supabaseKey,
    file,
  });
}

function anonymousIdentity(opts: { supabaseUrl: string; supabaseKey: string; file: string }): Identity {
  const db = createClient(opts.supabaseUrl, opts.supabaseKey, {
    auth: { storage: fileStorage(opts.file), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    kind: "anonymous",
    async token() {
      // getSession refreshes an expired access token from the stored refresh
      // token. Only the engine verifies tokens (with getClaims).
      const { data } = await db.auth.getSession();
      if (data.session) return data.session.access_token;
      const signedIn = await db.auth.signInAnonymously();
      if (signedIn.error || !signedIn.data.session) {
        throw new Error(`Anonymous sign-in failed: ${signedIn.error?.message ?? "no session"}`);
      }
      return signedIn.data.session.access_token;
    },
  };
}

/** Supabase auth storage in one JSON file, readable only by this user. */
function fileStorage(file: string) {
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  };
  const write = (all: Record<string, string>) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(all), { mode: 0o600 });
    chmodSync(file, 0o600);
  };
  return {
    getItem: (key: string) => read()[key] ?? null,
    setItem: (key: string, value: string) => write({ ...read(), [key]: value }),
    removeItem: (key: string) => {
      const all = read();
      delete all[key];
      write(all);
    },
  };
}
