# play-schema

The **Play cartridge**: the portable JSON document that fully describes one
Play (window, trigger, evidence budget, approval policy, action, exits,
Leash). The engine validates every cartridge with this zod schema before
storing or running it.

- `src/index.ts`: the schema, `PlayState`, `Mode`, helpers.
- `src/examples.ts`: reference cartridges (ETH breakout, BTC dip, NVDA
  earnings, buy-now), which double as templates and test fixtures.
- `play.schema.json`: generated JSON Schema for non-TypeScript clients.
  Regenerate with `pnpm --filter @baseland/play-schema export-schema`.

Rules enforced here, not just in the UI: an order can't exceed the Leash's
`maxOrderUsd`; the evidence budget can't exceed `maxEvidenceUsdc`;
`allowedProducts` is honoured; exits only apply to BUY Plays; every chip must
point at a real field. **Mode is not part of a cartridge**, so a shared
cartridge can never arm itself live.

Consumed as TypeScript source (no build step); the engine bundles it.
