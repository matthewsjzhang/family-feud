// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { BoardEvent } from "../../app/boardSnapshot";
import { applyEvent, NO_TRANSIENTS, useBoardEvents } from "./useBoardEvents";

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe("useBoardEvents", () => {
  it("calls the listener once per event, in order, even under StrictMode", () => {
    const listener = vi.fn<(e: BoardEvent) => void>();
    const events: BoardEvent[] = [{ type: "reveal", slot: 0, earned: true }, { type: "roundWon", team: 1, points: 30 }];
    const { rerender } = renderHook(({ batch }) => useBoardEvents(batch, listener), {
      wrapper: strict,
      initialProps: { batch: { id: 1, events } },
    });
    expect(listener.mock.calls.map(([e]) => e.type)).toEqual(["reveal", "roundWon"]);

    // Same batch again (e.g. a re-render): nothing new happens.
    rerender({ batch: { id: 1, events } });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("maps events to transient visuals", () => {
    let t = applyEvent(NO_TRANSIENTS, { type: "strike", count: 7 }, 1);
    expect(t.strike).toEqual({ key: 1, count: 3 });
    t = applyEvent(t, { type: "reveal", slot: 4, earned: false }, 2);
    expect(t.glow).toEqual({ 5: 2 });
    t = applyEvent(t, { type: "buzz", team: 0 }, 3);
    expect(t.buzz).toEqual({ key: 3, team: 0 });
    expect(applyEvent(t, { type: "newRound" }, 4)).toEqual(NO_TRANSIENTS);
  });
});
