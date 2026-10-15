// The host types what the player said; the matcher suggests a board answer and the
// host confirms it. The matcher never decides on its own.

import type { Ref } from "react";
import type { Answer } from "../../../data/bank";
import type { MatchResult } from "../../../engine/match";

interface AnswerEntryProps {
  label: string;
  value: string;
  onChange(value: string): void;
  suggestion: MatchResult | null;
  answers: readonly Answer[];
  /** Sudden Death: only #1 scores, so a match on anything else is still a miss. */
  onlyFirstCounts: boolean;
  canPick(index: number): boolean;
  onPick(index: number): void;
  inputRef?: Ref<HTMLInputElement>;
}

const MAX_CANDIDATES = 3;

export function AnswerEntry(props: AnswerEntryProps) {
  const { label, value, onChange, suggestion, answers, onlyFirstCounts, canPick, onPick, inputRef } = props;
  const suggested = suggestion?.index ?? null;

  return (
    <div className="hg-entry">
      <label className="hg-entry__label">
        {label}
        <input
          ref={inputRef}
          className="hg-entry__input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Type what they said…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggested !== null && canPick(suggested)) {
              e.preventDefault();
              onPick(suggested);
            } else if (e.key === "Escape") {
              // Back to shortcut mode: clear and leave the box.
              onChange("");
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      {value.trim() !== "" && suggestion && (
        <div className="hg-entry__result" aria-live="polite">
          {suggested !== null ? (
            <>
              <button
                type="button"
                className="hg-entry__suggestion"
                disabled={!canPick(suggested)}
                onClick={() => onPick(suggested)}
              >
                Suggested: #{suggested + 1} {answers[suggested]?.text} ({answers[suggested]?.points})
                <span className="hg-muted"> · Enter</span>
              </button>
              {onlyFirstCounts && suggested !== 0 && (
                <p className="hg-warn">Not the #1 answer, so it counts as a miss.</p>
              )}
            </>
          ) : (
            <>
              <p className="hg-muted">{suggestion.ambiguous ? "Too close to call:" : "No match on the board."}</p>
              <div className="hg-entry__candidates">
                {suggestion.candidates.slice(0, MAX_CANDIDATES).map((c) => (
                  <button key={c.index} type="button" disabled={!canPick(c.index)} onClick={() => onPick(c.index)}>
                    #{c.index + 1} {answers[c.index]?.text}?
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
