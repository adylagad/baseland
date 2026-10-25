import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CoinbaseCliError, createCliRunner, toError } from "../src/coinbase/cli.js";

const bin = fileURLToPath(new URL("./fixtures/fake-coinbase.mjs", import.meta.url));

describe("coinbase CLI runner", () => {
  it("passes the key via env only, with live env, no history, and a private config dir", async () => {
    process.env.SHOULD_NOT_LEAK = "1";
    const run = createCliRunner({ bin });
    const out = (await run(["echo", "portfolios"], { keyId: "kid", secret: "s3cret" })) as {
      args: string[];
      env: Record<string, unknown>;
    };
    expect(out.args).toEqual(["echo", "portfolios"]);
    expect(out.args.join(" ")).not.toContain("s3cret");
    expect(out.env).toEqual({
      COINBASE_ENV: "live",
      COINBASE_NO_HISTORY: "1",
      hasConfigDir: true,
      COINBASE_KEY_ID: "kid",
      hasSecret: true,
      leakedParentEnv: false,
    });
    delete process.env.SHOULD_NOT_LEAK;
  });

  it("runs keyless calls without key env vars", async () => {
    const run = createCliRunner({ bin });
    const out = (await run(["echo"], null)) as { env: Record<string, unknown> };
    expect(out.env.COINBASE_KEY_ID).toBeNull();
    expect(out.env.hasSecret).toBe(false);
  });

  it("turns a CLI failure into a CoinbaseCliError with status and body", async () => {
    const run = createCliRunner({ bin });
    const err = (await run(["forbidden"], null).catch((e: unknown) => e)) as CoinbaseCliError;
    expect(err).toBeInstanceOf(CoinbaseCliError);
    expect(err.status).toBe(403);
    expect(err.message).toBe("User does not have access to portfolio (HTTP 403)");
    expect(err.body).toMatchObject({ errorType: "permission_denied" });
  });

  it("rejects non-JSON output", async () => {
    const run = createCliRunner({ bin });
    await expect(run(["garbage"], null)).rejects.toThrow("non-JSON");
  });

  it("kills a hung process at the timeout", async () => {
    const run = createCliRunner({ bin, timeoutMs: 300 });
    await expect(run(["hang"], null)).rejects.toThrow("timed out");
  });

  it("parses a quoted-string body like the sandbox 401", () => {
    const err = toError('"unauthorized\\n"\n', 'error: "unauthorized\\n" (HTTP 401) [trace 1]', 1);
    expect(err.status).toBe(401);
    expect(err.body).toBe("unauthorized\n");
  });
});
