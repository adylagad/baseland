import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from "spacetimedb/server";

// The engine is the sole writer and private-table subscriber. Its Spacetime
// identity is captured when this database is first published. The iPhone
// never receives this token; Supabase continues to authenticate app users.
const operator = table({ name: "operator" }, {
  identity: t.identity().primaryKey(),
});

// Full Play and Tape records are private. JSON preserves the existing HTTP
// contract while indexed columns make authorization and subscriptions cheap.
const play = table({ name: "play" }, {
  id: t.string().primaryKey(),
  userId: t.string().index("btree"),
  state: t.string().index("btree"),
  mode: t.string(),
  updatedAt: t.string(),
  dataJson: t.string(),
});

const tape = table({ name: "tape" }, {
  id: t.u64().primaryKey().autoInc(),
  playId: t.string().index("btree"),
  userId: t.string().index("btree"),
  kind: t.string(),
  simulated: t.bool(),
  at: t.string(),
  dataJson: t.string(),
});

const tapeKey = table({ name: "tape_key" }, {
  key: t.string().primaryKey(),
});
const importKey = table({ name: "import_key" }, {
  sourceId: t.string().primaryKey(),
});

// An anonymous, safe shared world projection. Every Ghost Play transition
// updates it in the same transaction as the private Play row. It is the
// public real-time surface for a spectator dashboard.
const activity = table({ name: "activity", public: true }, {
  id: t.string().primaryKey(),
  symbol: t.string(),
  state: t.string(),
  headline: t.string(),
  updatedAt: t.string(),
});

const spacetimedb = schema({ operator, play, tape, tapeKey, importKey, activity });
export default spacetimedb;
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

export const init = spacetimedb.init((ctx) => {
  ctx.db.operator.insert({ identity: ctx.sender });
});

function requireOperator(ctx: Ctx) {
  if (!ctx.db.operator.identity.find(ctx.sender)) throw new SenderError("Only the Baseland engine may change Plays");
}

const states = new Set(["armed", "watching", "deciding", "awaiting", "executing", "done", "paused", "killed", "expired", "failed"]);
const terminal = new Set(["done", "killed", "expired", "failed"]);

function parsePlay(dataJson: string) {
  const value = JSON.parse(dataJson) as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.userId !== "string" || typeof value.state !== "string"
    || !states.has(value.state) || (value.mode !== "ghost" && value.mode !== "live")
    || typeof value.updatedAt !== "string") throw new SenderError("Invalid Play record");
  return value;
}

function project(ctx: Ctx, record: Record<string, unknown>) {
  const id = record.id as string;
  if (record.mode !== "ghost" || terminal.has(record.state as string)) {
    ctx.db.activity.id.delete(id);
    return;
  }
  const status = record.status as Record<string, unknown> | undefined;
  const headline: Record<string, string> = {
    armed: "Armed for the market.", watching: "Watching the market.", deciding: "Agent deciding.",
    awaiting: "Awaiting a human call.", executing: "Executing in Ghost.", paused: "Paused.",
  };
  const row = {
    id,
    symbol: typeof status?.symbol === "string" ? status.symbol : "?",
    state: record.state as string,
    headline: headline[record.state as string] ?? "Ghost Play in motion.",
    updatedAt: record.updatedAt as string,
  };
  if (ctx.db.activity.id.find(id)) ctx.db.activity.id.update(row);
  else ctx.db.activity.insert(row);
}

export const insertPlay = spacetimedb.reducer({ dataJson: t.string() }, (ctx, { dataJson }) => {
  requireOperator(ctx);
  const value = parsePlay(dataJson);
  if (value.state !== "armed" || ctx.db.play.id.find(value.id as string)) throw new SenderError("Play already exists or is not armed");
  ctx.db.play.insert({
    id: value.id as string,
    userId: value.userId as string,
    state: value.state as string,
    mode: value.mode as string,
    updatedAt: value.updatedAt as string,
    dataJson,
  });
  project(ctx, value);
});

export const updatePlay = spacetimedb.reducer(
  { id: t.string(), expectedState: t.string(), dataJson: t.string() },
  (ctx, { id, expectedState, dataJson }) => {
    requireOperator(ctx);
    const old = ctx.db.play.id.find(id);
    if (!old || old.state !== expectedState) throw new SenderError("Play changed underneath the engine");
    const value = parsePlay(dataJson);
    if (value.id !== id || value.userId !== old.userId || value.mode !== old.mode) throw new SenderError("Play identity cannot change");
    ctx.db.play.id.update({ ...old, state: value.state as string, updatedAt: value.updatedAt as string, dataJson });
    project(ctx, value);
  },
);

export const appendTape = spacetimedb.reducer(
  { playId: t.string(), userId: t.string(), kind: t.string(), simulated: t.bool(), at: t.string(), dataJson: t.string(), idempotencyKey: t.string() },
  (ctx, args) => {
    requireOperator(ctx);
    const owner = ctx.db.play.id.find(args.playId);
    if (!owner || owner.userId !== args.userId || (owner.mode === "ghost") !== args.simulated) {
      throw new SenderError("Tape does not match its Play");
    }
    if (args.idempotencyKey) {
      if (ctx.db.tapeKey.key.find(args.idempotencyKey)) throw new SenderError("Duplicate idempotency key");
      ctx.db.tapeKey.insert({ key: args.idempotencyKey });
    }
    ctx.db.tape.insert({ id: 0n, playId: args.playId, userId: args.userId, kind: args.kind,
      simulated: args.simulated, at: args.at, dataJson: args.dataJson });
  },
);

// One-time, restartable migration from the existing Supabase state. Keeping
// source IDs separate lets the new Tape use Spacetime's own sequence.
export const importPlay = spacetimedb.reducer({ dataJson: t.string() }, (ctx, { dataJson }) => {
  requireOperator(ctx);
  const value = parsePlay(dataJson);
  if (ctx.db.play.id.find(value.id as string)) return;
  ctx.db.play.insert({ id: value.id as string, userId: value.userId as string,
    state: value.state as string, mode: value.mode as string,
    updatedAt: value.updatedAt as string, dataJson });
  project(ctx, value);
});

export const importTape = spacetimedb.reducer(
  { sourceId: t.string(), playId: t.string(), userId: t.string(), kind: t.string(), simulated: t.bool(),
    at: t.string(), dataJson: t.string(), idempotencyKey: t.string() },
  (ctx, args) => {
    requireOperator(ctx);
    if (ctx.db.importKey.sourceId.find(args.sourceId)) return;
    const owner = ctx.db.play.id.find(args.playId);
    if (!owner || owner.userId !== args.userId || (owner.mode === "ghost") !== args.simulated) {
      throw new SenderError("Imported Tape does not match its Play");
    }
    if (args.idempotencyKey) {
      if (ctx.db.tapeKey.key.find(args.idempotencyKey)) throw new SenderError("Duplicate idempotency key");
      ctx.db.tapeKey.insert({ key: args.idempotencyKey });
    }
    ctx.db.importKey.insert({ sourceId: args.sourceId });
    ctx.db.tape.insert({ id: 0n, playId: args.playId, userId: args.userId, kind: args.kind,
      simulated: args.simulated, at: args.at, dataJson: args.dataJson });
  },
);
