import type { PlayState } from "@baseland/play-schema";

// Every legal stage change, in one table. The runtime asserts against it on
// every transition, so an impossible jump (e.g. awaiting → watching) is a
// thrown error rather than a silently corrupted Play.
//
// `watching` is reused after an entry fills while the Play watches its exits
// (status.phase = "exit"); exits then go watching → executing → done.
// `executing` cannot be paused or killed mid-order: a kill is applied once the
// order resolves, so the Tape never claims an order didn't happen.

const ALLOWED: Record<PlayState, readonly PlayState[]> = {
  armed: ["watching", "paused", "killed", "expired", "failed"],
  watching: ["deciding", "executing", "paused", "killed", "expired", "failed"],
  deciding: ["awaiting", "executing", "watching", "done", "killed", "expired", "failed"],
  awaiting: ["executing", "done", "killed", "expired", "failed"],
  executing: ["watching", "done", "killed", "failed"],
  paused: ["armed", "watching", "killed", "expired"],
  done: [],
  killed: [],
  expired: [],
  failed: [],
};

export const canTransition = (from: PlayState, to: PlayState) => ALLOWED[from].includes(to);

export class TransitionError extends Error {
  constructor(
    readonly from: PlayState,
    readonly to: PlayState,
  ) {
    super(`illegal Play transition ${from} → ${to}`);
    this.name = "TransitionError";
  }
}

export function assertTransition(from: PlayState, to: PlayState) {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

export const allowedFrom = (from: PlayState) => ALLOWED[from];
