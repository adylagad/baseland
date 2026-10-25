import { randomBytes } from "node:crypto";
import type { CliRunner } from "../src/coinbase/cli.js";
import { CoinbaseCliError } from "../src/coinbase/cli.js";
import { memoryCredentialStore } from "../src/credentials/store.js";
import type { MarketData } from "../src/market/public.js";
import { buildServer } from "../src/server.js";

export const SECRET = randomBytes(32).toString("base64");

/** Tokens are "token-<userId>"; anything else is rejected. */
export const verifyToken = async (t: string) => (t.startsWith("token-") ? t.slice(6) : null);

export interface FakeAccount {
  portfolios: { uuid: string; name: string; type: string }[];
  accessible: string[];
  rejectKey?: boolean;
}

/** Simulates `portfolios list` / `portfolios get` for one account. */
export function fakeCoinbase(account: FakeAccount): CliRunner & { calls: string[][] } {
  const calls: string[][] = [];
  const run = (async (args: string[]): Promise<unknown> => {
    calls.push(args);
    if (account.rejectKey) throw new CoinbaseCliError("unauthorized (HTTP 401)", 401, "unauthorized");
    if (args[0] === "portfolios" && args[1] === "list") return { portfolios: account.portfolios };
    if (args[0] === "portfolios" && args[1] === "get") {
      const p = account.portfolios.find((x) => x.uuid === args[2]);
      if (!p || !account.accessible.includes(p.uuid)) {
        throw new CoinbaseCliError("User does not have access to portfolio (HTTP 403)", 403, null);
      }
      return { portfolio: p, portfolio_balances: { total_balance: { value: "0", currency: "USD" } } };
    }
    throw new Error(`unexpected call ${args.join(" ")}`);
  }) as unknown as CliRunner & { calls: string[][] };
  run.calls = calls;
  return run;
}

export const fakeMarket: MarketData = {
  async quote(productId) {
    return { productId, price: 2353.57, change24hPct: -0.85, at: "2026-10-24T00:00:00.000Z" };
  },
};

export function testServer(run: CliRunner, store = memoryCredentialStore()) {
  const app = buildServer({
    verifyToken,
    run,
    credentials: store,
    market: fakeMarket,
    credentialsSecret: SECRET,
  });
  return { app, store };
}
