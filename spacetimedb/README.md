# Baseland SpacetimeDB module

SpacetimeDB 2.13 TypeScript module for Baseland's live Play state. Private
`play` and `tape` tables replace the old Supabase hot path. Reducers enforce
the engine identity, compare-and-set state updates, Tape ownership and
idempotency. An anonymous public `activity` projection exposes only Ghost
symbol and generic stage text for the shared Arena; it has no user ID, title,
cartridge, amount, or key.

```sh
spacetime start
spacetime publish --server local --module-path spacetimedb baseland-local
spacetime generate --lang typescript --include-private \
  --out-dir apps/engine/src/spacetime/bindings --module-path spacetimedb
spacetime generate --lang typescript \
  --out-dir apps/arena/src/bindings --module-path spacetimedb
```

Publish using the same identity whose token the engine will use. Do not put
that token in client code. If module signatures change, regenerate both
binding sets and run the local integration test before committing.

The module is published as `baseland-calhacks13` on Maincloud. The cloud
integration test passed. Configure the branch engine with that database's
host, name and publishing identity token before replacing the current Render
deployment. The token belongs only in the engine's gitignored `.env` or its
hosted secret settings.
