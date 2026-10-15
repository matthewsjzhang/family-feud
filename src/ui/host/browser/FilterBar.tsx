// Search box and filters for the question browser.

import type { RefObject } from "react";
import type { BankKind, BrowserFilters } from "./bankSearch";

const ANSWER_COUNTS = [4, 5, 6, 7, 8];

export interface FilterBarProps {
  bank: BankKind;
  filters: BrowserFilters;
  seasons: readonly number[];
  /** Label for the "fits the next round" toggle, or null when there is no next round. */
  nextRoundLabel: string | null;
  searchRef: RefObject<HTMLInputElement | null>;
  onChange(patch: Partial<BrowserFilters>): void;
}

const toNumber = (value: string) => (value === "" ? null : Number(value));

export function FilterBar({ bank, filters, seasons, nextRoundLabel, searchRef, onChange }: FilterBarProps) {
  return (
    <div className="qb-filters" role="search">
      <label className="qb-field qb-field--search">
        <span className="qb-field__label">Search questions and answers</span>
        <input
          ref={searchRef}
          type="search"
          className="qb-input"
          value={filters.query}
          placeholder="e.g. mother-in-law"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange({ query: e.target.value })}
        />
      </label>
      <label className="qb-field">
        <span className="qb-field__label">Season</span>
        <select
          className="qb-input"
          value={filters.season ?? ""}
          onChange={(e) => onChange({ season: toNumber(e.target.value) })}
        >
          <option value="">Any</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {bank === "main" && (
        <label className="qb-field">
          <span className="qb-field__label">Answers</span>
          <select
            className="qb-input"
            value={filters.answers ?? ""}
            onChange={(e) => onChange({ answers: toNumber(e.target.value) })}
          >
            <option value="">Any</option>
            {ANSWER_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="qb-toggles">
        <label className="qb-check">
          <input
            type="checkbox"
            checked={filters.hidePlayed}
            onChange={(e) => onChange({ hidePlayed: e.target.checked })}
          />
          Hide already played
        </label>
        <label className="qb-check">
          <input
            type="checkbox"
            checked={filters.fitsNext && nextRoundLabel !== null}
            disabled={nextRoundLabel === null}
            onChange={(e) => onChange({ fitsNext: e.target.checked })}
          />
          {nextRoundLabel ? `Fits the next round (${nextRoundLabel})` : "Fits the next round (no game running)"}
        </label>
      </div>
    </div>
  );
}
