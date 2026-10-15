// Create, edit and delete question sets ("preset games"): a name plus hand-picked questions
// for the rounds (in order), Sudden Death (first unused is played) and Fast Money (five or none).

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { QuestionBanks } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import { FAST_MONEY_QUESTION_COUNT, validateQuestionSet, type QuestionSet } from "../../../data/questionSets";
import type { GameRules } from "../../../engine/rules";
import { QuestionSearch, sourceText } from "./QuestionSearch";
import { answerCountText, roundLabel, searchSources, sizeNote, type SetSection } from "./questionSetSummary";
import { copyName } from "./rulesDraft";

export interface QuestionSetEditorProps {
  /** The set to edit, or null for a new one. */
  set: QuestionSet | null;
  /** The rules picked on the setup screen: they name the rounds and their usual sizes. */
  rules: GameRules;
  banks: QuestionBanks;
  find(id: string): Survey | undefined;
  /** Names of the saved sets, so "Save as new" can pick an unused one. */
  takenNames: readonly string[];
  onSave(set: QuestionSet): QuestionSet | null;
  /** A set was created or changed: select it on the setup screen. */
  onSaved(id: string): void;
  /** Delete after the host has confirmed; the editor closes. */
  onDelete?(id: string): void;
  onClose(): void;
}

type Lists = Pick<QuestionSet, SetSection>;

const SECTIONS: { key: SetSection; title: string; item: string; hint: string }[] = [
  {
    key: "rounds",
    title: "Rounds",
    item: "round",
    hint: "Played in order: the first question is round 1. Rounds the set doesn't cover use random questions.",
  },
  {
    key: "suddenDeath",
    title: "Sudden Death",
    item: "Sudden Death question",
    hint: "The first one not yet asked this game is played. With none, Sudden Death uses a random question.",
  },
  {
    key: "fastMoney",
    title: "Fast Money",
    item: "Fast Money question",
    hint: `Pick exactly ${FAST_MONEY_QUESTION_COUNT}, or none for random Fast Money questions.`,
  },
];

const move = <T,>(list: readonly T[], from: number, to: number): T[] => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
};

/** Where focus goes after a move or remove, once React has re-rendered. */
interface FocusRequest {
  section: SetSection;
  id: string | null;
  prefer: string[];
}

export function QuestionSetEditor({
  set,
  rules,
  banks,
  find,
  takenNames,
  onSave,
  onSaved,
  onDelete,
  onClose,
}: QuestionSetEditorProps) {
  const id = useId();
  const [currentId, setCurrentId] = useState(set?.id ?? "");
  const [name, setName] = useState(set?.name ?? "");
  const [lists, setLists] = useState<Lists>(() => ({
    rounds: [...(set?.rounds ?? [])],
    suddenDeath: [...(set?.suddenDeath ?? [])],
    fastMoney: [...(set?.fastMoney ?? [])],
  }));
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState<SetSection | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusRequest = useRef<FocusRequest | null>(null);
  const sources = useMemo(() => searchSources(banks), [banks]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const request = focusRequest.current;
    const root = rootRef.current;
    if (!request || !root) return;
    focusRequest.current = null;
    const section = root.querySelector<HTMLElement>(`[data-section="${request.section}"]`);
    const entry = [...(section?.querySelectorAll<HTMLElement>("[data-entry]") ?? [])].find(
      (el) => el.dataset.entry === request.id,
    );
    // Prefer the same kind of button; if it's now disabled (top/bottom), try the next choice.
    for (const action of request.prefer) {
      const target = (action === "add" ? section : entry)?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (target && !target.disabled) {
        target.focus();
        return;
      }
    }
  });

  const draft: QuestionSet = { id: currentId, name, ...lists };
  const errors = validateQuestionSet(draft);
  const valid = errors.length === 0;
  const allIds = new Set([...lists.rounds, ...lists.suddenDeath, ...lists.fastMoney]);

  const changed = () => {
    setDirty(true);
    setStatus(null);
    setActionError(null);
  };

  const editList = (section: SetSection, change: (list: string[]) => string[]) => {
    setLists((l) => ({ ...l, [section]: change(l[section]) }));
    changed();
  };

  const moveEntry = (section: SetSection, index: number, by: -1 | 1) => {
    const list = lists[section];
    focusRequest.current = { section, id: list[index]!, prefer: by < 0 ? ["up", "down"] : ["down", "up"] };
    editList(section, (l) => move(l, index, index + by));
  };

  const removeEntry = (section: SetSection, index: number) => {
    const list = lists[section];
    // Continue at the entry that slides into this place, else the one before, else "Add questions".
    const next = list[index + 1] ?? list[index - 1] ?? null;
    focusRequest.current = { section, id: next, prefer: next ? ["remove", "add"] : ["add"] };
    editList(section, (l) => l.filter((_, i) => i !== index));
  };

  const close = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this question set?")) return;
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const store = (toSave: QuestionSet, message: (saved: QuestionSet) => string) => {
    const saved = onSave(toSave);
    if (!saved) {
      setStatus(null);
      setActionError("Couldn't save this question set. Check the problems listed and try again.");
      return;
    }
    setCurrentId(saved.id);
    setName(saved.name);
    setDirty(false);
    setActionError(null);
    setStatus(message(saved));
    onSaved(saved.id);
  };

  const save = () => store(draft, () => "Saved.");

  const saveAsNew = () => {
    const taken = [...takenNames];
    const trimmed = name.trim();
    const newName = taken.includes(trimmed) ? copyName(trimmed, taken) : trimmed;
    store({ ...draft, id: "", name: newName }, (saved) => `Saved as "${saved.name}".`);
  };

  const remove = () => {
    if (!currentId || !onDelete) return;
    if (!window.confirm(`Delete the question set "${name.trim() || "Untitled"}"? This can't be undone.`)) return;
    onDelete(currentId);
  };

  const title = currentId ? `Edit question set: ${name.trim() || "Untitled"}` : "New question set";

  return (
    <section ref={rootRef} className="rules-editor qs-editor" aria-labelledby={`${id}-title`} onKeyDown={onKeyDown}>
      <header className="rules-editor__header">
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="setup-button" onClick={close}>
          Back to setup
        </button>
      </header>

      <div className="setup-field qs-editor__name">
        <label htmlFor={`${id}-name`}>Set name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            changed();
          }}
        />
      </div>
      <p className="setup-hint">
        Round names come from the &ldquo;{rules.name}&rdquo; rules. A question can only be used once in a set.
      </p>

      {SECTIONS.map(({ key, title: sectionTitle, item, hint }) => {
        const list = lists[key];
        const fmFull = key === "fastMoney" && list.length >= FAST_MONEY_QUESTION_COUNT;
        const label = (i: number) =>
          key === "rounds" ? roundLabel(rules, i) : key === "suddenDeath" ? `Sudden Death ${i + 1}` : `Fast Money ${i + 1}`;
        const itemName = (i: number) => `${item} ${i + 1}`;
        return (
          <fieldset key={key} className="rules-editor__group" data-section={key}>
            <legend>{sectionTitle}</legend>
            <p className="setup-hint qs-editor__hint">{hint}</p>
            {key === "fastMoney" && list.length === 0 && <p className="qs-editor__random">Random</p>}
            {key === "fastMoney" && list.length > 0 && list.length < FAST_MONEY_QUESTION_COUNT && (
              <p className="qs-editor__warn">
                {list.length} of {FAST_MONEY_QUESTION_COUNT} picked.
              </p>
            )}
            {list.length > 0 && (
              <ol className="qs-entries" aria-label={`${sectionTitle} questions`}>
                {list.map((surveyId, i) => {
                  const survey = find(surveyId);
                  const note = survey && key === "rounds" ? sizeNote(survey, rules, i) : null;
                  return (
                    <li key={surveyId} className="qs-entry" data-entry={surveyId}>
                      <div className="qs-entry__text">
                        <span className="qs-entry__label">{label(i)}</span>
                        <span className="qs-entry__question">{survey ? survey.question : "Missing question"}</span>
                        <span className="qs-entry__meta">
                          {survey
                            ? `${answerCountText(survey.answerCount)} · ${sourceText(survey)}`
                            : "Deleted? A random question plays instead."}
                        </span>
                        {note && <span className="qs-entry__note">{note}</span>}
                      </div>
                      <div className="rules-editor__round-actions">
                        <button
                          type="button"
                          className="setup-button setup-button--quiet"
                          data-action="up"
                          aria-label={`Move ${itemName(i)} up`}
                          disabled={i === 0}
                          onClick={() => moveEntry(key, i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="setup-button setup-button--quiet"
                          data-action="down"
                          aria-label={`Move ${itemName(i)} down`}
                          disabled={i === list.length - 1}
                          onClick={() => moveEntry(key, i, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="setup-button setup-button--quiet"
                          data-action="remove"
                          aria-label={`Remove ${itemName(i)}`}
                          onClick={() => removeEntry(key, i)}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {adding === key ? (
              <QuestionSearch
                target={sectionTitle}
                bank={key === "suddenDeath" ? sources.suddenDeath : sources.main}
                kind={key === "suddenDeath" ? "suddenDeath" : "main"}
                inSet={(surveyId) => allIds.has(surveyId)}
                blocked={fmFull ? `Fast Money has all ${FAST_MONEY_QUESTION_COUNT} questions.` : null}
                onAdd={(survey) => editList(key, (l) => (l.includes(survey.id) ? l : [...l, survey.id]))}
                onDone={() => {
                  focusRequest.current = { section: key, id: null, prefer: ["add"] };
                  setAdding(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="setup-button qs-editor__add"
                data-action="add"
                aria-label={`Add questions to ${sectionTitle}`}
                onClick={() => setAdding(key)}
              >
                Add questions
              </button>
            )}
          </fieldset>
        );
      })}

      <div className="rules-editor__footer">
        <div id={`${id}-errors`} className="rules-editor__errors" aria-live="polite">
          {!valid && (
            <>
              <p className="rules-editor__errors-title">Fix these before saving:</p>
              <ul>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        {actionError && (
          <p role="alert" className="rules-editor__error">
            {actionError}
          </p>
        )}
        {status && (
          <p role="status" className="rules-editor__status">
            {status}
          </p>
        )}
        <div className="setup-actions">
          <button
            type="button"
            className="setup-button setup-button--primary"
            disabled={!valid}
            aria-describedby={`${id}-errors`}
            onClick={save}
          >
            Save
          </button>
          {currentId && (
            <button
              type="button"
              className="setup-button"
              disabled={!valid}
              aria-describedby={`${id}-errors`}
              onClick={saveAsNew}
            >
              Save as new
            </button>
          )}
          {currentId && onDelete && (
            <button type="button" className="setup-button setup-button--danger" onClick={remove}>
              Delete
            </button>
          )}
          <button type="button" className="setup-button" onClick={close}>
            {dirty ? "Cancel" : "Close"}
          </button>
        </div>
      </div>
    </section>
  );
}
