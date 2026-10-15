// Corner control on the audience board: first an "enable sound" button (the
// board window has had no click yet, so the browser blocks audio), then a quiet
// mute toggle + volume slider that fades out so it doesn't distract on the TV.

import type { BoardSound } from "./useBoardSound";
import "./soundControl.css";

type Props = Pick<BoardSound, "unlocked" | "supported" | "muted" | "volume" | "toggleMute" | "setVolume" | "unlock">;

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg className="sc-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {off ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}

export function SoundControl(props: Props) {
  if (!props.supported) return null;

  if (!props.unlocked) {
    return (
      <div className="sc-root sc-locked">
        <button type="button" className="sc-enable" onClick={() => void props.unlock()}>
          <SpeakerIcon off />
          <span>Click to enable sound</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sc-root sc-ready" role="group" aria-label="Sound">
      <button
        type="button"
        className="sc-mute"
        aria-label="Mute sound"
        aria-pressed={props.muted}
        title={props.muted ? "Unmute sound" : "Mute sound"}
        onClick={props.toggleMute}
      >
        <SpeakerIcon off={props.muted} />
      </button>
      <input
        className="sc-volume"
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label="Sound volume"
        value={Math.round(props.volume * 100)}
        disabled={props.muted}
        onChange={(e) => props.setVolume(Number(e.currentTarget.value) / 100)}
      />
    </div>
  );
}
