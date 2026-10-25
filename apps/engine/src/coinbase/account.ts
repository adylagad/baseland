import { z } from "zod";
import { CoinbaseCliError, type CliRunner, type CoinbaseKey } from "./cli.js";

// Read-only account calls. Nothing in this file moves money.

const Portfolio = z.object({ uuid: z.string(), name: z.string(), type: z.string() });
export type Portfolio = z.infer<typeof Portfolio>;

const PortfolioList = z.object({ portfolios: z.array(Portfolio) });

const Money = z.object({ value: z.string(), currency: z.string() });
const PortfolioDetail = z.object({
  portfolio: Portfolio,
  portfolio_balances: z
    .object({
      total_balance: Money,
      total_crypto_balance: Money.optional(),
      total_cash_equivalent_balance: Money.optional(),
      total_equities_balance: Money.optional(),
    })
    .optional(),
});
export type PortfolioDetail = z.infer<typeof PortfolioDetail>;

export async function listPortfolios(run: CliRunner, key: CoinbaseKey): Promise<Portfolio[]> {
  return PortfolioList.parse(await run(["portfolios", "list"], key)).portfolios;
}

/** `null` when the key is not allowed to see this portfolio (HTTP 403). */
export async function getPortfolio(
  run: CliRunner,
  key: CoinbaseKey,
  uuid: string,
): Promise<PortfolioDetail | null> {
  try {
    return PortfolioDetail.parse(await run(["portfolios", "get", uuid], key));
  } catch (err) {
    if (err instanceof CoinbaseCliError && err.status === 403) return null;
    throw err;
  }
}

/**
 * The portfolios this key can actually access. `portfolios list` shows every
 * portfolio on the account regardless of the key's scope, so each one is
 * probed with `portfolios get`. (`balance` cannot be used for this; see
 * docs/builder-feedback.md.)
 */
export async function accessiblePortfolios(
  run: CliRunner,
  key: CoinbaseKey,
): Promise<PortfolioDetail[]> {
  const all = await listPortfolios(run, key);
  const details = await Promise.all(all.map((p) => getPortfolio(run, key, p.uuid)));
  return details.filter((d): d is PortfolioDetail => d !== null);
}
