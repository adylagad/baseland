# supabase

SQL migrations for the Baseland project (`vxapuqgqvecokhmfmnjl`).

Migrations are applied through the Supabase MCP (`apply_migration`), and the
files here are renamed to the version Supabase records so the two stay in
step. Check with `list_migrations` before adding one.

The model is in the first migration's header: **clients read, the engine
writes.** Every table has owner-only `select` RLS for the iOS app; all writes
go through the engine with the service role. `credentials` has RLS enabled
and **no policies**, so no client can read it. `plays` and `tape` are in the
Realtime publication, which drives the Live Activity.
