// Plain-text views of engine records for the model reading tool results.
// Every simulated thing says GHOST (AGENTS.md hard rule 4), here as on the
// phone.

type SentencePart = { kind: "text"; text: string } | { kind: "chip"; label: string };

export interface Play {
  id: string;
  title: string;
  sentence: SentencePart[];
  spec: unknown;
  mode: "ghost" | "live";
  state: string;
  stateReason: string | null;
  pending: { side: string; product: string; estUsd: number; headline: string } | null;
  status: { headline?: string; price?: number; pnlUsd?: number };
  windowStart: string;
  windowEnd: string;
  createdAt: string;
}

export interface TapeRow {
  at: string;
  kind: string;
  simulated: boolean;
  costUsdc?: number;
  payload: Record<string, unknown>;
}

export interface Replay {
  simulated: true;
  product: string;
  from: string;
  to: string;
  fired: boolean;
  trigger?: { at: string; price: number };
  entry?: { at: string; price: number; spentUsd: number; feeUsd: number };
  exit?: { at: string; price: number; reason: string };
  pnlUsd: number;
  holding: boolean;
  series: { t: string; close: number }[];
  notes: string[];
}

const TERMINAL = new Set(["done", "killed", "expired", "failed"]);
export const isFinished = (p: Pick<Play, "state">) => TERMINAL.has(p.state);

export const sentenceText = (s: SentencePart[]) => s.map((p) => (p.kind === "text" ? p.text : p.label)).join("");

const modeTag = (mode: string) => (mode === "ghost" ? "GHOST" : "LIVE");
const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const time = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

export function playLine(p: Play): string {
  const bits = [`[${modeTag(p.mode)}] ${p.title}`, p.state];
  if (p.status.headline) bits.push(p.status.headline);
  if (p.status.pnlUsd !== undefined) bits.push(`P&L ${usd(p.status.pnlUsd)}${p.mode === "ghost" ? " (simulated)" : ""}`);
  return `${bits.join(" · ")}  (id ${p.id})`;
}

export function playDetail(p: Play): string {
  const lines = [
    playLine(p),
    `“${sentenceText(p.sentence)}”`,
    `Window: ${time(p.windowStart)} → ${time(p.windowEnd)}`,
  ];
  if (p.stateReason) lines.push(`Reason: ${p.stateReason}`);
  if (p.pending) {
    lines.push(`Waiting for approval on the phone: ${p.pending.side} ${p.pending.product} ≈ ${usd(p.pending.estUsd)} — ${p.pending.headline}`);
  }
  return lines.join("\n");
}

function tapeSummary(t: TapeRow): string {
  const p = t.payload;
  const pick = (k: string) => (typeof p[k] === "string" || typeof p[k] === "number" ? String(p[k]) : undefined);
  if (t.kind === "state") {
    const from = pick("from");
    return `${from ? `${from} → ` : ""}${pick("to") ?? "?"}${pick("reason") ? ` (${pick("reason")})` : ""}`;
  }
  const text = pick("headline") ?? pick("reason") ?? pick("message") ?? pick("note") ?? pick("summary") ?? pick("decision");
  return text ?? JSON.stringify(p).slice(0, 160);
}

export function tapeLines(tape: TapeRow[]): string {
  if (tape.length === 0) return "The Tape is empty.";
  return tape
    .map((t) => {
      const cost = t.costUsdc ? ` · paid ${t.costUsdc} USDC${t.simulated ? " (simulated)" : ""}` : "";
      return `${time(t.at)}  ${t.simulated ? "GHOST " : ""}${t.kind}: ${tapeSummary(t)}${cost}`;
    })
    .join("\n");
}

export function replayText(r: Replay): string {
  const closes = r.series.map((s) => s.close);
  const lines = [
    `[GHOST] REPLAY of ${r.product}, ${time(r.from)} → ${time(r.to)} (simulated on real past prices)`,
    closes.length ? `Price range: ${usd(Math.min(...closes))} – ${usd(Math.max(...closes))}, last ${usd(closes.at(-1)!)}` : "",
  ];
  if (!r.fired) lines.push("The trigger never fired in this range: no trade.");
  if (r.trigger) lines.push(`Trigger fired ${time(r.trigger.at)} at ${usd(r.trigger.price)}`);
  if (r.entry) lines.push(`Entry: spent ${usd(r.entry.spentUsd)} at ${usd(r.entry.price)} (fee ${usd(r.entry.feeUsd)})`);
  if (r.exit) lines.push(`Exit: ${r.exit.reason.replace("_", " ")} at ${usd(r.exit.price)}, ${time(r.exit.at)}`);
  if (r.fired) lines.push(`Simulated P&L: ${usd(r.pnlUsd)}${r.holding ? " (still holding, marked to the last close)" : ""}`);
  lines.push(...r.notes.map((n) => `Note: ${n}`));
  return lines.filter(Boolean).join("\n");
}
