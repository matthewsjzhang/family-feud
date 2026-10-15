// The list of rounds in the rules editor: add, remove, reorder, edit each one.

import { useId } from "react";
import { BANK_MAX_ANSWERS, BANK_MIN_ANSWERS } from "../../../engine/rules";
import { NumberField } from "./NumberField";
import { newRoundDraft, type RoundDraft } from "./rulesDraft";

export interface RoundsEditorProps {
  rounds: RoundDraft[];
  onChange(rounds: RoundDraft[]): void;
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function RoundsEditor({ rounds, onChange }: RoundsEditorProps) {
  const id = useId();
  const update = (index: number, patch: Partial<RoundDraft>) =>
    onChange(rounds.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <fieldset className="rules-editor__group">
      <legend>Rounds</legend>
      <ol className="rules-editor__rounds">
        {rounds.map((round, i) => {
          const n = i + 1;
          return (
            <li key={round.key}>
              <fieldset className="rules-editor__round">
                <legend>Round {n}</legend>
                <div className="rules-editor__round-fields">
                  <div className="setup-field">
                    <label htmlFor={`${id}-${round.key}-name`}>Name</label>
                    <input
                      id={`${id}-${round.key}-name`}
                      type="text"
                      value={round.name}
                      autoComplete="off"
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </div>
                  <NumberField
                    label="Multiplier (×)"
                    min={1}
                    value={round.multiplier}
                    onChange={(multiplier) => update(i, { multiplier })}
                  />
                  <NumberField
                    label="Min answers"
                    min={BANK_MIN_ANSWERS}
                    max={BANK_MAX_ANSWERS}
                    value={round.minAnswers}
                    onChange={(minAnswers) => update(i, { minAnswers })}
                  />
                  <NumberField
                    label="Max answers"
                    min={BANK_MIN_ANSWERS}
                    max={BANK_MAX_ANSWERS}
                    value={round.maxAnswers}
                    onChange={(maxAnswers) => update(i, { maxAnswers })}
                  />
                </div>
                <div className="rules-editor__round-actions">
                  <button
                    type="button"
                    className="setup-button setup-button--quiet"
                    aria-label={`Move round ${n} up`}
                    disabled={i === 0}
                    onClick={() => onChange(move(rounds, i, i - 1))}
                  >
                    ↑ Up
                  </button>
                  <button
                    type="button"
                    className="setup-button setup-button--quiet"
                    aria-label={`Move round ${n} down`}
                    disabled={i === rounds.length - 1}
                    onClick={() => onChange(move(rounds, i, i + 1))}
                  >
                    ↓ Down
                  </button>
                  <button
                    type="button"
                    className="setup-button setup-button--quiet"
                    aria-label={`Remove round ${n}`}
                    disabled={rounds.length <= 1}
                    onClick={() => onChange(rounds.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="setup-actions">
        <button type="button" className="setup-button" onClick={() => onChange([...rounds, newRoundDraft()])}>
          Add round
        </button>
        <button
          type="button"
          className="setup-button"
          onClick={() => onChange(rounds.map((r) => ({ ...r, multiplier: "1" })))}
        >
          Set all multipliers to ×1
        </button>
      </div>
      <p className="setup-hint">
        Survey sizes run from {BANK_MIN_ANSWERS} to {BANK_MAX_ANSWERS} answers. Points come from the multiplier, not
        the round's name.
      </p>
    </fieldset>
  );
}
