import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { spacetimePlayStore } from "../src/spacetime/store.js";

const host = process.env.SPACETIMEDB_HOST;
const database = process.env.SPACETIMEDB_DB_NAME;
const token = process.env.SPACETIMEDB_TOKEN;
if (!host || !database || !token) throw new Error("Set the three SPACETIMEDB_* connection variables");
if (!new URL(host).hostname.match(/^(127\.0\.0\.1|localhost)$/)) throw new Error("The synthetic Arena demo only runs against a local SpacetimeDB");

const store = await spacetimePlayStore({ host, database, token }, {} as SupabaseClient);
try {
  const now = Date.now();
  const play = await store.insert({
    userId: randomUUID(), title: "Synthetic Ghost Play", sentence: [], spec: {} as never, mode: "ghost",
    status: { phase: "entry", symbol: "ETH", headline: "Watching the ETH market.", progress: 0 },
    windowStart: new Date(now + 3_600_000).toISOString(),
    windowEnd: new Date(now + 7_200_000).toISOString(),
  });
  console.log("Synthetic Ghost Play created. Watch the Arena move through its stages.");
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  await sleep(2000);
  await store.update(play.id, { state: "watching" }, "armed");
  await sleep(2000);
  await store.update(play.id, { state: "deciding", status: { ...play.status, headline: "Agent weighing the evidence.", progress: 0.55 } }, "watching");
  await sleep(2000);
  await store.update(play.id, { state: "awaiting", status: { ...play.status, headline: "Awaiting a human call.", progress: 0.8 } }, "deciding");
  await sleep(4000);
  await store.update(play.id, { state: "done", status: { ...play.status, headline: "Demo complete.", progress: 1 } }, "awaiting");
  console.log("Synthetic Ghost Play complete; Arena returned to idle.");
} finally {
  store.close();
}
