// Host-only question bank browser: search both banks, read the answer keys, pick the
// survey to play next, and write / edit / delete custom questions. Replaces the main
// host view while open; the game is untouched.

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { bankOf, type GameHost } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import type { CustomQuestionInput } from "../../../data/customQuestions";
import type { QuestionSet } from "../../../data/questionSets";
import type { UpcomingRound } from "../../../engine/mainGame";
import {
  fitProblem,
  NO_FILTERS,
  pickRandom,
  searchBank,
  seasonsOf,
  sizeNote,
  type BankKind,
  type BrowserFilters,
  type FilterContext,
} from "./bankSearch";
import { CustomQuestionForm } from "./CustomQuestionForm";
import { FilterBar } from "./FilterBar";
import { rowHeadId, SurveyRow } from "./SurveyRow";
import "../hostGame.css";
import "./questionBrowser.css";

export interface QuestionBrowserProps {
  host: GameHost;
  onClose(): void;
}

/** Rows rendered per "Show more"; the full bank is ~9,000 surveys. */
export const PAGE_SIZE = 50;

const TABS: { kind: BankKind; label: string }[] = [
  { kind: "main", label: "Main game" },
  { kind: "suddenDeath", label: "Sudden Death" },
];

/** Names of the saved question sets that use a survey. */
export function setsUsing(sets: readonly QuestionSet[], id: string): string[] {
  return sets.filter((set) => [...set.rounds, ...set.suddenDeath, ...set.fastMoney].includes(id)).map((set) => set.name);
}

/** "A", "A" and "B", "A", "B" and "C". */
function quotedList(names: readonly string[]): string {
  const quoted = names.map((n) => `"${n}"`);
  return quoted.length < 2 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}

/** The confirm text for deleting a custom question, naming any question sets that use it. */
export function deleteConfirmText(survey: Survey, sets: readonly QuestionSet[]): string {
  const using = setsUsing(sets, survey.id);
  const base = `Delete the custom question "${survey.question}"? This can't be undone.`;
  if (!using.length) return base;
  const which = using.length === 1 ? "question set" : "question sets";
  const skip = using.length === 1 ? "that set" : "those sets";
  return `${base} It is used in the ${which} ${quotedList(using)}; ${skip} will skip it.`;
}

type FormState = { mode: "add" } | { mode: "edit"; id: string };

function roundLabel(upcoming: UpcomingRound | null): string | null {
  if (!upcoming) return null;
  if (upcoming.kind === "suddenDeath") return upcoming.name;
  const { minAnswers: min, maxAnswers: max } = upcoming;
  return `${upcoming.name}, ${min === max ? min : `${min}-${max}`} answers`;
}

export function QuestionBrowser({ host, onClose }: QuestionBrowserProps) {
  const { banks, upcoming, queued, isUsed } = host;
  const [bank, setBank] = useState<BankKind>("main");
  const [filters, setFilters] = useState<BrowserFilters>(NO_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [surprise, setSurprise] = useState<Survey | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  /** Confirmation after saving or deleting a custom question. */
  const [notice, setNotice] = useState<string | null>(null);
  /** An element id to focus after the next render (a row head, or the Add button). */
  const [focusId, setFocusId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const surveys = useMemo(() => (banks ? banks[bank] : []), [banks, bank]);
  // Custom questions sit in the tab of their kind, listed before the show's surveys.
  // Kept as separate arrays so the big bank's search index isn't rebuilt on every edit.
  const customAll = banks?.custom;
  const customByKind = useMemo(() => {
    const custom = customAll ?? [];
    return {
      main: custom.filter((s) => s.custom === "main"),
      suddenDeath: custom.filter((s) => s.custom === "suddenDeath"),
    };
  }, [customAll]);
  const customs = customByKind[bank];
  const seasons = useMemo(() => seasonsOf(surveys), [surveys]);
  // Typing updates the box immediately; the scan re-runs at lower priority.
  const deferredFilters = useDeferredValue(filters);
  const results = useMemo(() => {
    const ctx: FilterContext = { bank, isUsed, upcoming };
    return [...searchBank(customs, deferredFilters, ctx), ...searchBank(surveys, deferredFilters, ctx)];
  }, [customs, surveys, deferredFilters, bank, isUsed, upcoming]);
  const shown = results.slice(0, limit);

  const sdBank = banks?.suddenDeath;
  const sdIds = useMemo(() => new Set(sdBank?.map((s) => s.id)), [sdBank]);
  const kindOf = (s: Survey): BankKind => bankOf(s, sdIds);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape anywhere closes the browser (the search box handles its own Escape first).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeFilters = (patch: Partial<BrowserFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setLimit(PAGE_SIZE);
    setNote(null);
    setNotice(null);
  };

  const switchBank = (kind: BankKind) => {
    if (kind === bank) return;
    setBank(kind);
    setLimit(PAGE_SIZE);
    setSurprise(null);
    setNote(null);
    setNotice(null);
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** After a save: show the question in its tab, expanded and focused, widening filters if they hide it. */
  const reveal = (saved: Survey) => {
    const kind = kindOf(saved);
    switchBank(kind);
    const visible = searchBank([saved], filters, { bank: kind, isUsed, upcoming }).length > 0;
    if (!visible) setFilters({ ...NO_FILTERS, source: "custom" });
    setLimit(PAGE_SIZE);
    setExpanded((prev) => new Set(prev).add(saved.id));
    setFocusId(rowHeadId(saved.id));
  };

  const saveCustom = (input: CustomQuestionInput): boolean => {
    const editingId = form?.mode === "edit" ? form.id : null;
    const saved = editingId ? host.updateCustomQuestion(editingId, input) : host.addCustomQuestion(input);
    if (!saved) return false;
    setForm(null);
    reveal(saved);
    setNotice(editingId ? `Saved changes to "${saved.question}".` : `Saved "${saved.question}". It's shown below.`);
    return true;
  };

  const cancelForm = () => {
    // Return focus to where the form was opened from.
    setFocusId(form?.mode === "edit" ? rowHeadId(form.id) : "qb-add");
    setForm(null);
  };

  const deleteCustom = (s: Survey) => {
    if (!window.confirm(deleteConfirmText(s, host.questionSets))) return;
    host.removeCustomQuestion(s.id);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(s.id);
      return next;
    });
    if (surprise?.id === s.id) setSurprise(null);
    if (form?.mode === "edit" && form.id === s.id) setForm(null);
    setNotice(`Deleted "${s.question}".`);
    setFocusId("qb-add");
  };

  const openEditor = (id: string) => {
    setNotice(null);
    setForm({ mode: "edit", id });
  };

  const surpriseMe = () => {
    const pick = pickRandom(results, isUsed);
    setSurprise(pick);
    setNote(pick ? null : "Every survey matching these filters has already been played.");
    if (pick) setExpanded((prev) => new Set(prev).add(pick.id));
  };

  const onSearchKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // First Escape in a non-empty search box clears it rather than leaving the browser.
    if (e.key === "Escape" && e.target === searchRef.current && filters.query) {
      e.preventDefault();
      changeFilters({ query: "" });
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    switchBank(TABS[next]!.kind);
    tabRefs.current[next]?.focus();
  };

  const row = (s: Survey, keyPrefix = "") => {
    const custom = s.custom !== undefined;
    // Only the main list edits in place; the surprise copy would duplicate the form.
    const editing = custom && !keyPrefix && form?.mode === "edit" && form.id === s.id;
    return (
      <SurveyRow
        key={keyPrefix + s.id}
        idPrefix={keyPrefix}
        survey={s}
        expanded={expanded.has(s.id)}
        played={isUsed(s.id)}
        queued={queued?.id === s.id}
        problem={fitProblem(s, bank, upcoming)}
        note={sizeNote(s, bank, upcoming)}
        onToggle={() => toggle(s.id)}
        onQueue={() => host.queueSurvey(s.id)}
        onEdit={custom ? () => openEditor(s.id) : undefined}
        onDelete={custom ? () => deleteCustom(s) : undefined}
        editor={
          editing ? (
            <CustomQuestionForm
              initial={host.toCustomInput(s)}
              defaultKind={bank}
              onSave={saveCustom}
              saveError={host.lastError}
              onCancel={cancelForm}
            />
          ) : undefined
        }
      />
    );
  };

  const count = results.length;
  const status = `${count.toLocaleString()} ${count === 1 ? "survey matches" : "surveys match"}`;
  const queuedProblem = queued ? fitProblem(queued, kindOf(queued), upcoming) : null;
  const queuedNote = queued && !queuedProblem ? sizeNote(queued, kindOf(queued), upcoming) : null;

  return (
    <section className="qb" aria-labelledby="qb-title" onKeyDown={onSearchKey}>
      <div className="qb-top">
        <h2 id="qb-title" className="qb-title">
          Question bank
        </h2>
        <button type="button" className="hg-btn" onClick={onClose}>
          {host.state ? "Back to the game" : "Back to setup"} <kbd className="hg-kbd">Esc</kbd>
        </button>
      </div>

      <div className="qb-queued" aria-label="Next question">
        {queued ? (
          <>
            <div className="qb-queued__text">
              <span className="qb-queued__label">Playing next:</span> {queued.question}{" "}
              <span className="hg-muted">
                ({kindOf(queued) === "suddenDeath" ? "Sudden Death" : `${queued.answerCount} answers`})
              </span>
              {queuedProblem && <p className="qb-warn">{queuedProblem}; it will wait for a round it fits.</p>}
              {queuedNote && <p className="hg-muted qb-queued__note">{queuedNote}</p>}
            </div>
            <button type="button" className="hg-btn" onClick={host.clearQueue}>
              Clear
            </button>
          </>
        ) : (
          <span className="hg-muted">No question picked; the next round draws a random one.</span>
        )}
      </div>

      <div className="qb-tabs" role="tablist" aria-label="Question bank">
        {TABS.map((t, i) => (
          <button
            key={t.kind}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`qb-tab-${t.kind}`}
            aria-selected={bank === t.kind}
            aria-controls="qb-panel"
            tabIndex={bank === t.kind ? 0 : -1}
            className="qb-tab"
            onClick={() => switchBank(t.kind)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}{" "}
            <span className="qb-tab__count">
              {((banks?.[t.kind].length ?? 0) + customByKind[t.kind].length).toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      <div id="qb-panel" role="tabpanel" aria-labelledby={`qb-tab-${bank}`} className="qb-panel">
        {form?.mode === "add" && (
          <div className="qb-form-panel">
            <CustomQuestionForm defaultKind={bank} onSave={saveCustom} saveError={host.lastError} onCancel={cancelForm} />
          </div>
        )}

        <FilterBar
          bank={bank}
          filters={filters}
          seasons={seasons}
          nextRoundLabel={roundLabel(upcoming)}
          searchRef={searchRef}
          onChange={changeFilters}
        />

        <div className="qb-summary">
          <p role="status" aria-live="polite" className="qb-status">
            {status}
          </p>
          <div className="qb-summary__buttons">
            <button
              type="button"
              id="qb-add"
              className="hg-btn"
              aria-expanded={form?.mode === "add"}
              onClick={() => {
                setNotice(null);
                setForm({ mode: "add" });
              }}
            >
              Add custom question
            </button>
            <button type="button" className="hg-btn" onClick={surpriseMe} disabled={count === 0}>
              Surprise me
            </button>
          </div>
        </div>
        {note && <p className="qb-warn">{note}</p>}
        <p className="qb-notice" aria-live="polite">
          {notice}
        </p>

        {surprise && (
          <div className="qb-surprise">
            <div className="qb-surprise__head">
              <h3 className="qb-subtitle">Surprise pick</h3>
              <button type="button" className="qb-link" onClick={() => setSurprise(null)}>
                Dismiss
              </button>
            </div>
            <ul className="qb-list" aria-label="Surprise pick">
              {row(surprise, "surprise-")}
            </ul>
          </div>
        )}

        {count > 0 ? (
          <ul className="qb-list" aria-label="Matching surveys">
            {shown.map((s) => row(s))}
          </ul>
        ) : (
          <p className="hg-muted">No surveys match. Try fewer words or clear a filter.</p>
        )}

        {count > shown.length && (
          <div className="qb-more">
            <span className="hg-muted">
              Showing {shown.length.toLocaleString()} of {count.toLocaleString()}
            </span>
            <button type="button" className="hg-btn" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              Show more
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
