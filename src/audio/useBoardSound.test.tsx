// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext } from "./fakeAudio";
import { SoundControl } from "./SoundControl";
import { SOUND_STORAGE_KEY, useBoardSound } from "./useBoardSound";

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
const lastCtx = () => FakeAudioContext.instances.at(-1)!;
const stored = () => JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY) ?? "null") as unknown;

beforeEach(() => {
  FakeAudioContext.reset("suspended");
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("useBoardSound", () => {
  it("starts locked, unlocks, then plays event batches", async () => {
    const { result } = renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }), { wrapper: strict });
    expect(result.current.unlocked).toBe(false);
    await act(() => result.current.unlock());
    expect(result.current.unlocked).toBe(true);
    act(() => result.current.onEvents([{ type: "strike", count: 1 }]));
    expect(lastCtx().sources.length).toBeGreaterThan(0);
  });

  it("unlocks on any click or key in the window", async () => {
    const { result } = renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }));
    await act(async () => {
      fireEvent.keyDown(window, { key: "a" });
    });
    expect(result.current.unlocked).toBe(true);
  });

  it("keeps onEvents stable across renders", async () => {
    const { result } = renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }));
    const first = result.current.onEvents;
    await act(() => result.current.unlock());
    act(() => result.current.toggleMute());
    expect(result.current.onEvents).toBe(first);
  });

  it("persists muted and volume", () => {
    const { result, unmount } = renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }));
    act(() => result.current.toggleMute());
    act(() => result.current.setVolume(0.4));
    expect(stored()).toEqual({ muted: true, volume: 0.4 });
    unmount();

    const again = renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }));
    expect(again.result.current.muted).toBe(true);
    expect(again.result.current.volume).toBe(0.4);
  });

  it("ignores bad stored values", () => {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ muted: "yes", volume: 9 }));
    const { result } = renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }));
    expect(result.current.muted).toBe(false);
    expect(result.current.volume).toBe(0.8);
    localStorage.setItem(SOUND_STORAGE_KEY, "{not json");
    expect(() => renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }))).not.toThrow();
  });

  it("works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    const { result } = renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }));
    expect(result.current.muted).toBe(false);
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
    await act(() => result.current.unlock());
    expect(result.current.unlocked).toBe(true);
  });

  it("muted: event batches schedule nothing", async () => {
    const { result } = renderHook(() => useBoardSound({ AudioContext: FakeAudioContext }));
    await act(() => result.current.unlock());
    act(() => result.current.toggleMute());
    act(() => result.current.onEvents([{ type: "gameWon", team: 0 }]));
    expect(lastCtx().sources).toHaveLength(0);
  });
});

function Harness({ AudioContext }: { AudioContext: typeof FakeAudioContext | null }) {
  const sound = useBoardSound({ AudioContext });
  return <SoundControl {...sound} />;
}

describe("SoundControl", () => {
  it("shows 'enable sound' first, then a mute toggle and volume slider", async () => {
    render(<Harness AudioContext={FakeAudioContext} />);
    const enable = screen.getByRole("button", { name: /click to enable sound/i });
    expect(screen.queryByRole("button", { name: /mute sound/i })).toBeNull();

    await act(async () => {
      fireEvent.click(enable);
    });
    expect(screen.queryByRole("button", { name: /enable sound/i })).toBeNull();
    const mute = screen.getByRole("button", { name: "Mute sound" });
    expect(mute).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("slider", { name: /sound volume/i })).toHaveValue("80");

    fireEvent.click(mute);
    expect(mute).toHaveAttribute("aria-pressed", "true");
    expect(stored()).toEqual({ muted: true, volume: 0.8 });
    fireEvent.click(mute);
    expect(mute).toHaveAttribute("aria-pressed", "false");
  });

  it("changes the volume with the slider", async () => {
    render(<Harness AudioContext={FakeAudioContext} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enable sound/i }));
    });
    fireEvent.change(screen.getByRole("slider", { name: /sound volume/i }), { target: { value: "35" } });
    expect(stored()).toEqual({ muted: false, volume: 0.35 });
  });

  it("renders nothing without Web Audio", () => {
    const { container } = render(<Harness AudioContext={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
