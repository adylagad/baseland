import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Runs the official `coinbase` CLI as a child process. Each call gets:
// - the user's key via env vars for that process only (never argv, never disk),
// - a throwaway COINBASE_CONFIG_DIR, deleted afterwards, so nothing persists,
// - COINBASE_NO_HISTORY=1, so the CLI keeps no request log.
// See docs/code-traps.md ("Keys via env vars also need COINBASE_ENV").

export interface CoinbaseKey {
  keyId: string;
  secret: string;
}

export class CoinbaseCliError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "CoinbaseCliError";
  }
}

export type CliRunner = (args: string[], key: CoinbaseKey | null) => Promise<unknown>;

export function resolveCoinbaseBin(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("@coinbase/coinbase-cli/package.json");
  return join(dirname(pkg), "dist", "index.js");
}

export interface CliRunnerOptions {
  bin?: string;
  timeoutMs?: number;
}

export function createCliRunner(opts: CliRunnerOptions = {}): CliRunner {
  const bin = opts.bin ?? resolveCoinbaseBin();
  const timeoutMs = opts.timeoutMs ?? 20_000;

  return async (args, key) => {
    const configDir = await mkdtemp(join(tmpdir(), "baseland-cb-"));
    try {
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: configDir,
        COINBASE_ENV: "live",
        COINBASE_NO_HISTORY: "1",
        COINBASE_CONFIG_DIR: configDir,
        NO_COLOR: "1",
      };
      if (key) {
        env.COINBASE_KEY_ID = key.keyId;
        env.COINBASE_KEY_SECRET = key.secret;
      }
      const { code, stdout, stderr } = await run(process.execPath, [bin, ...args], env, timeoutMs);
      if (code === 0) return parseJson(stdout);
      throw toError(stdout, stderr, code);
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  };
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new CoinbaseCliError(`coinbase CLI timed out after ${timeoutMs}ms`, null, null));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new CoinbaseCliError("coinbase CLI returned non-JSON output", null, trimmed.slice(0, 500));
  }
}

// On failure the CLI prints the response body as JSON, then a line like
// `error: <message> (HTTP 403) [trace ...]`, on stdout and/or stderr.
export function toError(stdout: string, stderr: string, code: number | null): CoinbaseCliError {
  const all = `${stdout}\n${stderr}`;
  const errorLine = all.split("\n").find((l) => l.startsWith("error:"));
  const status = /\(HTTP (\d{3})\)/.exec(all)?.[1];
  let body: unknown = null;
  for (const line of all.split("\n")) {
    const t = line.trim();
    if (t.startsWith("{") || t.startsWith('"')) {
      try {
        body = JSON.parse(t);
        break;
      } catch {
        // not the body line
      }
    }
  }
  const message = errorLine
    ? errorLine.replace(/^error:\s*/, "").replace(/\s*\[trace.*$/, "")
    : `coinbase CLI exited with code ${code}`;
  return new CoinbaseCliError(message, status ? Number(status) : null, body);
}
