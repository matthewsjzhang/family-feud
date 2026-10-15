// The setup screen's "Questions" choice: random questions or a saved question set,
// with a summary of the set against the chosen rules and buttons to manage sets.

import { useId, type Ref } from "react";
import type { QuestionSet } from "../../../data/questionSets";
import type { GameRules } from "../../../engine/rules";
import { summarizeQuestionSet, type SurveyLookup } from "./questionSetSummary";

export interface QuestionSetPanelProps {
  sets: readonly QuestionSet[];
  /** The chosen set, or null for random questions. */
  selected: QuestionSet | null;
  rules: GameRules;
  find: SurveyLookup;
  onSelect(id: string | null): void;
  /** Missing when sets can't be edited here; buttons are disabled while questions load. */
  onNew?(): void;
  onEdit?(): void;
  onDelete?(): void;
  /** False while the question banks are loading (nothing to pick from yet). */
  canEdit: boolean;
  selectRef?: Ref<HTMLSelectElement>;
  newRef?: Ref<HTMLButtonElement>;
  editRef?: Ref<HTMLButtonElement>;
}

const RANDOM = "";

export function QuestionSetPanel({
  sets,
  selected,
  rules,
  find,
  onSelect,
  onNew,
  onEdit,
  onDelete,
  canEdit,
  selectRef,
  newRef,
  editRef,
}: QuestionSetPanelProps) {
  const id = useId();
  const summary = selected && summarizeQuestionSet(selected, rules, find);

  return (
    <section className="setup__rules setup__questions">
      <h2>Questions</h2>
      <div className="setup-field">
        {/* The heading shows "Questions"; the label stays for screen readers. */}
        <label htmlFor={`${id}-set`} className="setup-visually-hidden">
          Questions
        </label>
        <select
          id={`${id}-set`}
          ref={selectRef}
          value={selected?.id ?? RANDOM}
          aria-describedby={`${id}-about`}
          onChange={(e) => onSelect(e.target.value === RANDOM ? null : e.target.value)}
        >
          <option value={RANDOM}>Random questions</option>
          {sets.length > 0 && (
            <optgroup label="Question sets">
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <p id={`${id}-about`} className="setup-hint">
        {selected
          ? "Hand-picked questions, played in order. Anything the set doesn't cover is random."
          : "Every round gets a random question of the right size. Pick a question set to choose them yourself."}
      </p>

      {selected && summary && (
        <>
          <dl className="setup__summary" aria-label={`Question set ${selected.name}`}>
            <dt>Rounds</dt>
            <dd>{summary.rounds}</dd>
            <dt>Sudden Death</dt>
            <dd>{summary.suddenDeath}</dd>
            <dt>Fast Money</dt>
            <dd>{summary.fastMoney}</dd>
          </dl>
          {(summary.notes.length > 0 || summary.missing.length > 0) && (
            <ul className="qs-notes" aria-label="Notes about this question set">
              {summary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
              {summary.missing.length > 0 && (
                <li>
                  {summary.missing.length === 1
                    ? "1 question no longer exists (a deleted custom question?), so a random one plays instead:"
                    : `${summary.missing.length} questions no longer exist (deleted custom questions?), so random ones play instead:`}
                  <ul aria-label="Missing questions">
                    {summary.missing.map((m) => (
                      <li key={m.where}>{m.where}</li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {(onNew || onEdit || onDelete) && (
        <div className="setup-actions qs-panel__actions">
          {onNew && (
            <button type="button" ref={newRef} className="setup-button" disabled={!canEdit} onClick={onNew}>
              New set
            </button>
          )}
          {selected && onEdit && (
            <button type="button" ref={editRef} className="setup-button" disabled={!canEdit} onClick={onEdit}>
              Edit set
            </button>
          )}
          {selected && onDelete && (
            <button type="button" className="setup-button setup-button--danger" onClick={onDelete}>
              Delete set
            </button>
          )}
        </div>
      )}
      {!canEdit && (onNew || onEdit) && <p className="setup-hint">Questions are still loading…</p>}
    </section>
  );
}
