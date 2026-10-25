import { describe, expect, it } from "vitest";
import { PlayState, TERMINAL_STATES } from "@baseland/play-schema";
import { allowedFrom, assertTransition, canTransition, TransitionError } from "../src/plays/machine.js";

describe("state machine", () => {
  it("terminal states go nowhere", () => {
    for (const s of TERMINAL_STATES) expect(allowedFrom(s)).toEqual([]);
  });

  it("every state can be killed or reach a terminal state, except executing waits for its order", () => {
    for (const s of PlayState.options) {
      if (TERMINAL_STATES.includes(s)) continue;
      expect(allowedFrom(s).some((t) => TERMINAL_STATES.includes(t))).toBe(true);
    }
    expect(canTransition("executing", "paused")).toBe(false);
  });

  it("the happy path is legal", () => {
    const path = ["armed", "watching", "deciding", "awaiting", "executing", "watching", "executing", "done"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
  });

  it("refuses impossible jumps", () => {
    expect(() => assertTransition("awaiting", "watching")).toThrow(TransitionError);
    expect(() => assertTransition("armed", "executing")).toThrow("illegal Play transition armed → executing");
    expect(() => assertTransition("done", "watching")).toThrow(TransitionError);
  });
});
