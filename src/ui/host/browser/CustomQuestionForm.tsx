// Add or edit a custom question: the question, its kind (main game or Sudden Death)
// and its answers with points. Validation is the data layer's own, shown as you type.

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_ANSWERS, validateCustomQuestion, type CustomQuestionInput } from "../../../data/customQuestions";
import type { BankKind } from "./bankSearch";

/** Fewest answers a main-game custom question may have (the data layer allows 2). */
export const MIN_MAIN_ANSWERS = 2;
const NEW_MAIN_ROWS = 4;

interface Row {
  /** Stable React key, so removing a row doesn't shift focus or typed text. */
  key: number;
  text: string;
  /** Kept as typed; converted (and validated) on save. */
  points: string;
}

export interface CustomQuestionFormProps {
  /** Prefill for editing; omit for a new question. */
  initial?: CustomQuestionInput;
  /** Kind for a new question (the tab the host is on). */
  defaultKind: BankKind;
  /** Save; false if the host refused it (the reason arrives in `saveError`). */
  onSave(input: CustomQuestionInput): boolean;
  /** The host's last error, shown after a refused save. */
  saveError: string | null;
  onCancel(): void;
}

let nextKey = 0;
const row = (text = "", points = ""): Row => ({ key: nextKey++, text, points });

const toPoints = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

export function CustomQuestionForm({ initial, defaultKind, onSave, saveError, onCancel }: CustomQuestionFormProps) {
  const uid = useId();
  const editing = initial !== undefined;
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [suddenDeath, setSuddenDeath] = useState(initial ? initial.suddenDeath : defaultKind === "suddenDeath");
  // All rows are kept while Sudden Death shows only the first, so switching back restores them.
  const [rows, setRows] = useState<Row[]>(() =>
    initial
      ? initial.answers.map((a) => row(a.text, String(a.points)))
      : Array.from({ length: NEW_MAIN_ROWS }, () => row()),
  );
  // Errors show once the host has typed something or tried to save, not on a blank form.
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const rowRefs = useRef(new Map<number, HTMLInputElement>());
  const focusRow = useRef<number | null>(null);

  useEffect(() => {
    questionRef.current?.focus();
  }, []);

  // After adding or removing a row, put focus somewhere sensible.
  useEffect(() => {
    if (focusRow.current === null) return;
    rowRefs.current.get(focusRow.current)?.focus();
    focusRow.current = null;
  });

  const visible = suddenDeath ? rows.slice(0, 1) : rows;
  const input: CustomQuestionInput = {
    question,
    answers: visible.map((r) => ({ text: r.text, points: toPoints(r.points) })),
    suddenDeath,
  };
  const errors = validateCustomQuestion(input);
  const showErrors = touched && errors.length > 0;

  const edit = (key: number, patch: Partial<Row>) => {
    setTouched(true);
    setFailed(false);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const setKind = (sd: boolean) => {
    setSuddenDeath(sd);
    setFailed(false);
    // A main-game question needs at least two rows to fill in.
    if (!sd) setRows((rs) => (rs.length >= MIN_MAIN_ANSWERS ? rs : [...rs, ...Array.from({ length: MIN_MAIN_ANSWERS - rs.length }, () => row())]));
  };

  const addRow = () => {
    const added = row();
    focusRow.current = added.key;
    setRows((rs) => [...rs, added]);
  };

  const removeRow = (index: number) => {
    setTouched(true);
    const remaining = rows.filter((_, i) => i !== index);
    focusRow.current = remaining[Math.min(index, remaining.length - 1)]?.key ?? null;
    setRows(remaining);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errors.length) return;
    setFailed(!onSave(input));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    // Escape cancels the form instead of closing the whole browser.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  const titleId = `${uid}-title`;
  const errorsId = `${uid}-errors`;
  const canAdd = !suddenDeath && rows.length < MAX_ANSWERS;
  const canRemove = !suddenDeath && rows.length > MIN_MAIN_ANSWERS;

  return (
    <form className="qb-form" aria-labelledby={titleId} onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <h3 id={titleId} className="qb-subtitle">
        {editing ? "Edit custom question" : "Add a custom question"}
      </h3>

      <label className="qb-field">
        <span className="qb-field__label">Question</span>
        <textarea
          ref={questionRef}
          className="qb-input qb-form__question"
          rows={2}
          value={question}
          placeholder="e.g. Name something you bring to a picnic"
          onChange={(e) => {
            setTouched(true);
            setFailed(false);
            setQuestion(e.target.value);
          }}
        />
      </label>

      <fieldset className="qb-form__kind">
        <legend className="qb-field__label">Type</legend>
        <label className="qb-check">
          <input type="radio" name={`${uid}-kind`} checked={!suddenDeath} onChange={() => setKind(false)} />
          Main game (2-{MAX_ANSWERS} answers)
        </label>
        <label className="qb-check">
          <input type="radio" name={`${uid}-kind`} checked={suddenDeath} onChange={() => setKind(true)} />
          Sudden Death (1 answer)
        </label>
      </fieldset>

      <fieldset className="qb-form__answers">
        <legend className="qb-field__label">
          {suddenDeath ? "Answer" : `Answers (${visible.length} of up to ${MAX_ANSWERS})`}
        </legend>
        <ol className="qb-form__rows">
          {visible.map((r, i) => (
            <li key={r.key} className="qb-form__row">
              <span className="qb-answer__num" aria-hidden="true">
                {i + 1}
              </span>
              <input
                ref={(el) => {
                  if (el) rowRefs.current.set(r.key, el);
                  else rowRefs.current.delete(r.key);
                }}
                className="qb-input qb-form__text"
                aria-label={`Answer ${i + 1}`}
                value={r.text}
                autoComplete="off"
                onChange={(e) => edit(r.key, { text: e.target.value })}
              />
              <input
                className="qb-input qb-form__points"
                aria-label={`Points for answer ${i + 1}`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="Pts"
                value={r.points}
                onChange={(e) => edit(r.key, { points: e.target.value })}
              />
              {!suddenDeath && (
                <button
                  type="button"
                  className="hg-btn qb-form__remove"
                  aria-label={`Remove answer ${i + 1}`}
                  disabled={!canRemove}
                  onClick={() => removeRow(i)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
        {!suddenDeath && (
          <button type="button" className="hg-btn" disabled={!canAdd} onClick={addRow}>
            Add answer
          </button>
        )}
        <p className="hg-muted qb-form__hint">
          {suddenDeath
            ? "Sudden Death questions have a single answer."
            : "Answers go on the board most points first; the order you type them doesn't matter."}
        </p>
      </fieldset>

      <div className="qb-form__actions">
        <button type="submit" className="hg-btn hg-btn--primary" aria-describedby={showErrors ? errorsId : undefined}>
          {editing ? "Save changes" : "Save question"}
        </button>
        <button type="button" className="hg-btn" onClick={onCancel}>
          Cancel
        </button>
        <div id={errorsId} className="qb-form__errors" aria-live="polite">
          {showErrors && (
            <ul aria-label="Problems to fix">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
          {failed && <p className="qb-warn">{saveError ?? "The question couldn't be saved."}</p>}
        </div>
      </div>
    </form>
  );
}
