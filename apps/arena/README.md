# Live Arena

Read-only shared Ghost dashboard. It connects directly to the public
`activity` table in SpacetimeDB and reflects every transaction immediately.
Private Plays, Tape, portfolios and credentials are absent from its bindings.

```sh
pnpm --filter @baseland/arena dev
```

The default is the branch's cloud database, `baseland-calhacks13` on
`https://maincloud.spacetimedb.com`. Set `VITE_SPACETIMEDB_HOST` and
`VITE_SPACETIMEDB_DB_NAME` to point at a local database. No token is needed.
For a local, synthetic Ghost walkthrough, run
`pnpm --filter @baseland/engine demo:arena` with the engine's SpacetimeDB
environment set. The demo script refuses remote hosts and never places an
order.
