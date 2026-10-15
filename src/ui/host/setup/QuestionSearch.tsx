// Search panel for adding questions to one section of a question set.
// Results come in pages so typing stays quick with thousands of surveys.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Survey } from "../../../data/bank";
import { NO_FILTERS, pickRandom, searchBank, type BankKind } from "../browser/bankSearch";
import { answerCountText } from "./questionSetSummary";

export const RESULTS_PAGE_SIZE = 20;

export interface QuestionSearchProps {
  /** e.g. "Rounds": used in the heading and status messages. */
  target: string;
  bank: readonly Survey[];
  kind: BankKind;
  /** Already somewhere in the set: a question can't be used twice. */
  inSet(id: string): boolean;
  /** Why nothing more can be added right now (e.g. Fast Money is full), or null. */
  blocked: string | null;
  onAdd(survey: Survey): void;
  onDone(): void;
}

export const sourceText = (survey: Survey) => (survey.custom ? "Custom" : `Season ${survey.season}`);

export function QuestionSearch({ target, bank, kind, inSet, blocked, onAdd, onDone }: QuestionSearchProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [answers, setAnswers] = useState<number | null>(null);
  const [shown, setShown] = useState(RESULTS_PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(
    () => searchBank(bank, { ...NO_FILTERS, query, answers }, { bank: kind, isUsed: () => false, upcoming: null }),
    [bank, kind, query, answers],
  );
  const sizes = useMemo(() => [...new Set(bank.map((s) => s.answerCount))].sort((a, b) => a - b), [bank]);

  const add = (survey: Survey) => {
    onAdd(survey);
    setStatus(`Added "${survey.question}" to ${target}.`);
  };

  const addRandom = () => {
    const survey = pickRandom(results, inSet);
    if (survey) add(survey);
    else setStatus("Every matching question is already in the set.");
  };

  return (
    <section className="qs-search" aria-labelledby={`${id}-title`}>
      <div className="qs-search__header">
        <h4 id={`${id}-title`}>Add to {target}</h4>
        <button type="button" className="setup-button setup-button--quiet" onClick={onDone}>
          Done adding
        </button>
      </div>
      <div className="qs-search__filters">
        <div className="setup-field">
          <label htmlFor={`${id}-q`}>Search questions</label>
          <input
            id={`${id}-q`}
            ref={inputRef}
            type="text"
            value={query}
            autoComplete="off"
            placeholder="Words in the question or answers"
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(RESULTS_PAGE_SIZE);
            }}
          />
        </div>
        {kind === "main" && (
          <div className="setup-field qs-search__size">
            <label htmlFor={`${id}-size`}>Answers</label>
            <select
              id={`${id}-size`}
              value={answers ?? ""}
              onChange={(e) => {
                setAnswers(e.target.value === "" ? null : Number(e.target.value));
                setShown(RESULTS_PAGE_SIZE);
              }}
            >
              <option value="">Any</option>
              {sizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="setup-actions">
        <p className="qs-search__count" aria-live="polite">
          {results.length === 1 ? "1 question" : `${results.length.toLocaleString()} questions`}
        </p>
        <button type="button" className="setup-button setup-button--quiet" disabled={blocked !== null} onClick={addRandom}>
          Add random
        </button>
      </div>
      {blocked && <p className="setup-hint">{blocked}</p>}
      <p className="setup-visually-hidden" role="status">
        {status}
      </p>

      <ul className="qs-results" aria-label="Search results">
        {results.slice(0, shown).map((survey) => {
          const used = inSet(survey.id);
          const open = expanded === survey.id;
          const panelId = `${id}-answers-${survey.id}`;
          return (
            <li key={survey.id} className="qs-result">
              <div className="qs-result__row">
                <button
                  type="button"
                  className="qs-result__head"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setExpanded(open ? null : survey.id)}
                >
                  <span className="qs-entry__question">{survey.question}</span>
                  <span className="qs-entry__meta">
                    {answerCountText(survey.answerCount)} · {sourceText(survey)}
                  </span>
                </button>
                <button
                  type="button"
                  className="setup-button setup-button--quiet"
                  aria-label={`Add ${survey.question}`}
                  disabled={used || blocked !== null}
                  onClick={() => add(survey)}
                >
                  {used ? "In set" : "Add"}
                </button>
              </div>
              {open && (
                <ol id={panelId} className="qs-result__answers" aria-label={`Answers to ${survey.question}`}>
                  {survey.answers.map((a, i) => (
                    <li key={i}>
                      <span>{a.text}</span> <span className="qs-entry__meta">{a.points}</span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
      {results.length > shown && (
        <button
          type="button"
          className="setup-button setup-button--quiet"
          onClick={() => setShown((n) => n + RESULTS_PAGE_SIZE)}
        >
          Show more ({(results.length - shown).toLocaleString()} left)
        </button>
      )}
    </section>
  );
}
