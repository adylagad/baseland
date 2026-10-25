import { createClient } from "@supabase/supabase-js";
import { isTerminal } from "@baseland/play-schema";
import { supabasePlayStore, type TapeRow } from "../src/plays/store.js";

// Dry-run by default. Run while the old engine is paused, before switching
// traffic to the Spacetime-backed engine. Reducers make retries idempotent.
const apply = process.argv.includes("--apply");
const expected = (name: string) => {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  if (!arg) return null;
  const value = Number(arg.slice(name.length + 1));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative integer`);
  return value;
};
const expectedPlays = expected("--expect-plays");
const expectedTape = expected("--expect-tape");
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SPACETIMEDB_HOST", "SPACETIMEDB_DB_NAME", "SPACETIMEDB_TOKEN"] as const;
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const old = supabasePlayStore(db);
const url = new URL(`/v1/database/${encodeURIComponent(process.env.SPACETIMEDB_DB_NAME!)}/call/`, process.env.SPACETIMEDB_HOST!);

async function call(reducer: string, args: unknown[]) {
  const response = await fetch(new URL(reducer, url), {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SPACETIMEDB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${reducer} failed with HTTP ${response.status}`);
}

const ids: string[] = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from("plays").select("id").order("id").range(offset, offset + 999);
  if (error) throw new Error(`Cannot list Supabase Plays: ${error.message}`);
  ids.push(...(data ?? []).map((row) => row.id as string));
  if ((data?.length ?? 0) < 1000) break;
}

let tapeCount = 0;
let activeLive = 0;
const plays = [];
const tapeByPlay = new Map<string, TapeRow[]>();
for (const id of ids) {
  const play = await old.get(id);
  if (!play) throw new Error(`Supabase Play ${id} disappeared during the source read; retry after pausing the old engine.`);
  plays.push(play);
  if (play.mode === "live" && !isTerminal(play.state)) activeLive++;
  const rows: TapeRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("tape")
      .select("id,at,play_id,user_id,kind,simulated,cost_usdc,payload,idempotency_key")
      .eq("play_id", id).order("id").range(offset, offset + 999);
    if (error) throw new Error(`Cannot read Supabase Tape for Play ${id}: ${error.message}`);
    rows.push(...(data ?? []).map((row) => ({
      id: row.id as number, at: row.at as string, playId: row.play_id as string,
      userId: row.user_id as string, kind: row.kind as TapeRow["kind"],
      simulated: row.simulated as boolean, costUsdc: Number(row.cost_usdc),
      payload: row.payload as Record<string, unknown>,
      idempotencyKey: (row.idempotency_key as string | null) ?? undefined,
    })));
    if ((data?.length ?? 0) < 1000) break;
  }
  tapeByPlay.set(id, rows);
  tapeCount += rows.length;
}
console.log(`Supabase source: ${plays.length} Plays, ${tapeCount} Tape rows, ${activeLive} active live Plays.`);
if (!apply) {
  console.log(`Dry run only. After pausing the old engine, pass --apply --expect-plays=${plays.length} --expect-tape=${tapeCount}.`);
  process.exit(0);
}
if (expectedPlays === null || expectedTape === null) throw new Error("Apply requires --expect-plays=N and --expect-tape=N from a recent dry run.");
if (plays.length !== expectedPlays || tapeCount !== expectedTape) throw new Error("Supabase source counts changed since the dry run; no import was started.");
if (!plays.length && !process.argv.includes("--allow-empty-source")) throw new Error("Supabase source is empty; pass --allow-empty-source only after confirming this is expected.");
if (activeLive) throw new Error("Active live Plays must be resolved before migration; no import was started.");

let copiedTape = 0;
for (const play of plays) {
  await call("import_play", [JSON.stringify(play)]);
  for (const row of tapeByPlay.get(play.id) ?? []) {
    const { id, at, ...event } = row;
    await call("import_tape", [String(id), row.playId, row.userId, row.kind, row.simulated,
      at, JSON.stringify(event), row.idempotencyKey ?? ""]);
    copiedTape++;
  }
}
console.log(`SpacetimeDB migration complete: ${plays.length} Plays and ${copiedTape} Tape rows submitted. Re-run safely if interrupted.`);
