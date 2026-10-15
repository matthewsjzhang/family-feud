// Host-only question bank browser: search both banks, read the answer keys, and pick
// the survey to play next. Replaces the main host view while open; the game is untouched.

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { GameHost } from "../../../app/useGameHost";
import type { Survey } from "../../../data/bank";
import type { UpcomingRound } from "../../../engine/mainGame";
import {
  fitProblem,
  NO_FILTERS,
  pickRandom,
  searchBank,
  seasonsOf,
  type BankKind,
  type BrowserFilters,
} from "./bankSearch";
import { FilterBar } from "./FilterBar";
import { SurveyRow } from "./SurveyRow";
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
  const searchRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const surveys = useMemo(() => (banks ? banks[bank] : []), [banks, bank]);
  const seasons = useMemo(() => seasonsOf(surveys), [surveys]);
  // Typing updates the box immediately; the scan re-runs at lower priority.
  const deferredFilters = useDeferredValue(filters);
  const results = useMemo(
    () => searchBank(surveys, deferredFilters, { bank, isUsed, upcoming }),
    [surveys, deferredFilters, bank, isUsed, upcoming],
  );
  const shown = results.slice(0, limit);

  const sdIds = useMemo(() => new Set(banks?.suddenDeath.map((s) => s.id)), [banks]);
  const bankOf = (s: Survey): BankKind => (sdIds.has(s.id) ? "suddenDeath" : "main");

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
  };

  const switchBank = (kind: BankKind) => {
    if (kind === bank) return;
    setBank(kind);
    setLimit(PAGE_SIZE);
    setSurprise(null);
    setNote(null);
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

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

  const row = (s: Survey, keyPrefix = "") => (
    <SurveyRow
      key={keyPrefix + s.id}
      idPrefix={keyPrefix}
      survey={s}
      expanded={expanded.has(s.id)}
      played={isUsed(s.id)}
      queued={queued?.id === s.id}
      problem={fitProblem(s, bank, upcoming)}
      onToggle={() => toggle(s.id)}
      onQueue={() => host.queueSurvey(s.id)}
    />
  );

  const count = results.length;
  const status = `${count.toLocaleString()} ${count === 1 ? "survey matches" : "surveys match"}`;
  const queuedProblem = queued ? fitProblem(queued, bankOf(queued), upcoming) : null;

  return (
    <section className="qb" aria-labelledby="qb-title" onKeyDown={onSearchKey}>
      <div className="qb-top">
        <h2 id="qb-title" className="qb-title">
          Question bank
        </h2>
        <button type="button" className="hg-btn" onClick={onClose}>
          Back to the game <kbd className="hg-kbd">Esc</kbd>
        </button>
      </div>

      <div className="qb-queued" aria-label="Next question">
        {queued ? (
          <>
            <div className="qb-queued__text">
              <span className="qb-queued__label">Playing next:</span> {queued.question}{" "}
              <span className="hg-muted">
                ({bankOf(queued) === "suddenDeath" ? "Sudden Death" : `${queued.answerCount} answers`})
              </span>
              {queuedProblem && <p className="qb-warn">{queuedProblem}; it will wait for a round it fits.</p>}
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
            {t.label} <span className="qb-tab__count">{(banks?.[t.kind].length ?? 0).toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div id="qb-panel" role="tabpanel" aria-labelledby={`qb-tab-${bank}`} className="qb-panel">
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
          <button type="button" className="hg-btn" onClick={surpriseMe} disabled={count === 0}>
            Surprise me
          </button>
        </div>
        {note && <p className="qb-warn">{note}</p>}

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
