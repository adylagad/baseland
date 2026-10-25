# Coinbase portfolio and API key

Gives Baseland's engine trade access to **one dedicated portfolio** and
nothing else. Every CDP key is scoped to exactly one portfolio, which is what
keeps the agent away from the rest of your money.

## 1. Create the dedicated portfolio (website only)

Portfolios cannot be created in the mobile app.

1. Sign in at coinbase.com on a computer.
2. Open **Advanced** trade → the portfolio switcher → **Create portfolio**.
3. Name it **Baseland**.

## 2. Fund it (~$20 total)

1. Transfer about **$15 in USD or USDC** into the Baseland portfolio. This is
   for the live demo trades of about $2–5 each.
2. Keep about **$5 in USDC**. x402 payments use your USDC balance on Base.
   Which portfolio's USDC gets used when the key is scoped to Baseland is
   still unknown (tracked in `development-testing-backlog.md`), so for now
   put $2–3 of USDC in **both** the Baseland and the primary portfolio. We
   will find out with a one-cent payment and then move it.

## 3. Create the API key

1. Go to **portal.cdp.coinbase.com** → create a project if asked →
   **API Keys** → **Create API Key**.
2. Under **API restrictions → Coinbase App & Advanced Trade**:
   - **Portfolio:** Baseland
   - Enable **View** (default), **Trade**, and **Transfer**. Transfer only
     moves funds between your own portfolios; it cannot withdraw.
   - If there is an x402 or payments permission, enable it as well.
3. Do **not** enable withdrawals or any external transfer permission.
4. Download the key JSON file and store it outside the repo:
   `~/.config/baseland/cdp_api_key.json`.

## 4. Tell Claude it's ready

Say "the Coinbase key is at ~/.config/baseland/cdp_api_key.json". Don't paste
its contents into chat. The first test is read-only (`portfolios list`,
`balance`), and no order is placed without you saying so.

## Revoking

portal.cdp.coinbase.com → API Keys → delete the key. That cuts the engine off
immediately.
