// React glue for the board's sound: one player per board window, mute/volume
// remembered in localStorage, and unlocking on the first click or key press
// anywhere in the window (browsers require a gesture before audio can play).

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { BoardEvent } from "../app/boardSnapshot";
import { createSoundPlayer, type AudioContextCtor, type SoundPlayer } from "./player";

export const SOUND_STORAGE_KEY = "feud.sound";

interface SoundPrefs {
  muted: boolean;
  volume: number;
}

const DEFAULT_PREFS: SoundPrefs = { muted: false, volume: 0.8 };

function loadPrefs(): SoundPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
    const r = raw as Partial<Record<keyof SoundPrefs, unknown>>;
    return {
      muted: typeof r.muted === "boolean" ? r.muted : DEFAULT_PREFS.muted,
      volume: typeof r.volume === "number" && r.volume >= 0 && r.volume <= 1 ? r.volume : DEFAULT_PREFS.volume,
    };
  } catch {
    // Blocked storage (private mode, sandboxed iframe) or bad JSON: use defaults.
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: SoundPrefs): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Not remembering a preference is fine.
  }
}

export interface BoardSound {
  /** Feed every event batch from the host here (once per batch). Stable identity. */
  onEvents(events: readonly BoardEvent[]): void;
  unlocked: boolean;
  supported: boolean;
  muted: boolean;
  volume: number;
  toggleMute(): void;
  setVolume(volume: number): void;
  unlock(): Promise<void>;
}

export interface UseBoardSoundOptions {
  /** Injectable for tests; defaults to the browser's AudioContext. */
  AudioContext?: AudioContextCtor | null;
}

export function useBoardSound(options: UseBoardSoundOptions = {}): BoardSound {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [player] = useState<SoundPlayer>(() =>
    createSoundPlayer({ ...loadPrefs(), AudioContext: options.AudioContext, onChange: rerender }),
  );
  const playerRef = useRef(player);

  const muted = player.muted;
  const volume = player.volume;
  const unlocked = player.unlocked;

  useEffect(() => {
    savePrefs({ muted, volume });
  }, [muted, volume]);

  const unlock = useCallback(() => playerRef.current.unlock(), []);

  // Any click or key on the board counts as the gesture, not just our button.
  useEffect(() => {
    if (unlocked || !player.supported) return;
    const handler = () => void unlock();
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [unlocked, player, unlock]);

  const onEvents = useCallback((events: readonly BoardEvent[]) => playerRef.current.playEvents(events), []);
  const toggleMute = useCallback(() => playerRef.current.setMuted(!playerRef.current.muted), []);
  const setVolume = useCallback((v: number) => playerRef.current.setVolume(v), []);

  return { onEvents, unlocked, supported: player.supported, muted, volume, toggleMute, setVolume, unlock };
}
