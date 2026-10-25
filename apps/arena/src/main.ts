import { DbConnection, tables } from "./bindings";
import "./style.css";

const host = import.meta.env.VITE_SPACETIMEDB_HOST || "https://maincloud.spacetimedb.com";
const database = import.meta.env.VITE_SPACETIMEDB_DB_NAME || "baseland-calhacks13";
const $ = (id: string) => document.getElementById(id)!;
const connection = $("connection");
let applied = false;

const safe = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

const db = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(database)
  .withAutomaticReconnect()
  .onConnect((ctx) => {
    connection.textContent = "Syncing…";
    ctx.subscriptionBuilder().onApplied(() => { applied = true; connection.textContent = "LIVE · SPACETIMEDB"; render(); })
      .onError(() => { connection.textContent = "Subscription error"; }).subscribe(tables.activity);
  })
  .onAutomaticReconnect(() => { connection.textContent = "Syncing…"; })
  .onDisconnect(() => { connection.textContent = "Reconnecting…"; })
  .onConnectError(() => { connection.textContent = "Offline"; })
  .build();

db.db.activity.onInsert(render);
db.db.activity.onUpdate(render);
db.db.activity.onDelete(render);

function render() {
  if (!applied) return;
  const rows = [...db.db.activity.iter()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $("active-count").textContent = String(rows.length);
  $("watching-count").textContent = String(rows.filter((row) => row.state === "watching").length);
  $("deciding-count").textContent = String(rows.filter((row) => row.state === "deciding").length);
  $("awaiting-count").textContent = String(rows.filter((row) => row.state === "awaiting").length);
  $("plays").innerHTML = rows.length ? rows.map((row) => `
    <article class="play"><span class="symbol">${safe(row.symbol)}</span><div class="play-copy"><strong>${safe(row.headline)}</strong><small>${safe(row.updatedAt.replace("T", " ").slice(0, 19))} UTC</small></div><span class="stage stage-${safe(row.state)}">${safe(row.state.toUpperCase())}</span></article>
  `).join("") : '<p class="empty">Waiting for the next Ghost Play.</p>';
}
