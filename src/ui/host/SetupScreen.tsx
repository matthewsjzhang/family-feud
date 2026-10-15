// Before the game: name the two families and their players, and pick (or edit) the rules preset.

import { useEffect, useId, useRef, useState } from "react";
import type { FamilySetup, GameSetup, QuestionBanks } from "../../app/useGameHost";
import type { Survey } from "../../data/bank";
import type { QuestionSet } from "../../data/questionSets";
import type { ChampionRecord } from "../../engine/champions";
import { createPresetStore, localPresetStorage, type PresetStore } from "../../engine/presets";
import { DEFAULT_RULES } from "../../engine/rules";
import { RulesEditor } from "./RulesEditor";
import { ChampionPanel } from "./setup/ChampionPanel";
import { FamilyPanel } from "./setup/FamilyPanel";
import { summarizePreset } from "./setup/presetSummary";
import { defaultFamilies, finalizeFamilies, loadSetup, saveSetup } from "./setup/setupStorage";
import "./setup.css";

export interface SetupScreenProps {
  onStart(setup: GameSetup): void;
  /** Where presets come from; tests inject an in-memory store. */
  presetStore?: PresetStore;
  /** The returning champions (they play as family 1, with `championReturning: true`). */
  champion?: ChampionRecord | null;
  /** A family that just retired undefeated, to congratulate. */
  retiredChampion?: ChampionRecord | null;
  /** Forget the champions (a new group of players). */
  onClearChampion?(): void;
  /** Saved question sets ("preset games"); the setup screen picks one or random questions. */
  questionSets?: QuestionSet[];
  onSaveQuestionSet?(set: QuestionSet): QuestionSet | null;
  onRemoveQuestionSet?(id: string): void;
  /** Every question (main, Sudden Death, custom) for the question set editor. */
  banks?: QuestionBanks | null;
  findSurvey?(id: string): Survey | undefined;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

function retiredText({ family, wins, winnings }: ChampionRecord): string {
  const after = `after ${wins} ${wins === 1 ? "win" : "wins"}`;
  return winnings > 0
    ? `The ${family.name} family retires undefeated ${after}, with ${money(winnings)}!`
    : `The ${family.name} family retires undefeated ${after}!`;
}

export function SetupScreen({
  onStart,
  presetStore,
  champion = null,
  retiredChampion = null,
  onClearChampion,
}: SetupScreenProps) {
  const id = useId();
  const [store] = useState(() => presetStore ?? createPresetStore(localPresetStorage()));
  const [saved] = useState(loadSetup);
  const [presetId, setPresetId] = useState(() =>
    saved.presetId && store.get(saved.presetId) ? saved.presetId : DEFAULT_RULES.id,
  );
  const [families, setFamilies] = useState<[FamilySetup, FamilySetup]>(() => {
    const initial = saved.families ?? defaultFamilies();
    // Challengers who just took the title are now the champions: don't offer them as challengers too.
    const sameAsChampion =
      champion !== null && initial[1].name.trim().toLowerCase() === champion.family.name.trim().toLowerCase();
    return sameAsChampion ? [initial[0], defaultFamilies()[1]] : initial;
  });
  const [editing, setEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => saveSetup({ presetId, families }), [presetId, families]);

  useEffect(() => {
    // Return focus to "Edit rules" when the editor closes.
    if (wasEditing.current && !editing) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const presets = store.list();
  const rules = store.get(presetId) ?? DEFAULT_RULES;
  const summary = summarizePreset(rules);
  const builtIns = presets.filter((p) => p.builtIn);
  const customs = presets.filter((p) => !p.builtIn);

  if (editing) {
    return (
      <div className="setup">
        <RulesEditor
          store={store}
          presetId={rules.id}
          onSaved={setPresetId}
          onDeleted={() => {
            setPresetId(DEFAULT_RULES.id);
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }

  const setFamily = (team: 0 | 1, family: FamilySetup) =>
    setFamilies((current) => (team === 0 ? [family, current[1]] : [current[0], family]));

  return (
    // Not a <form>: Enter in a name field must not start the game by accident.
    <section className="setup" aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`} className="setup__title">
        New game
      </h1>

      {retiredChampion && (
        <p className="setup-retired" role="status">
          {retiredText(retiredChampion)}
        </p>
      )}

      <div className="setup__families">
        {/* The champions panel replaces family 1 but leaves its saved names alone for later. */}
        {champion ? (
          <ChampionPanel champion={champion} limit={rules.championLimit} onClear={onClearChampion} />
        ) : (
          <FamilyPanel team={0} family={families[0]} onChange={(f) => setFamily(0, f)} />
        )}
        <FamilyPanel
          team={1}
          family={families[1]}
          label={champion ? "Family 2 · Challengers" : undefined}
          onChange={(f) => setFamily(1, f)}
        />
      </div>

      <section className="setup__rules" aria-labelledby={`${id}-rules`}>
        <h2 id={`${id}-rules`}>Rules</h2>
        <div className="setup-field">
          <label htmlFor={`${id}-preset`}>Rules preset</label>
          <select id={`${id}-preset`} value={rules.id} onChange={(e) => setPresetId(e.target.value)}>
            <optgroup label="Built-in">
              {builtIns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {customs.length > 0 && (
              <optgroup label="Your presets">
                {customs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <dl className="setup__summary" aria-label={`Summary of ${rules.name}`}>
          <dt>Rounds</dt>
          <dd>{summary.rounds}</dd>
          <dt>Last round</dt>
          <dd>{summary.repeat}</dd>
          <dt>Win</dt>
          <dd>{summary.win}</dd>
          <dt>Sudden Death</dt>
          <dd>{summary.suddenDeath}</dd>
          <dt>Fast Money</dt>
          <dd>{summary.fastMoney}</dd>
          <dt>Champions</dt>
          <dd>{summary.champions}</dd>
        </dl>
      </section>

      <div className="setup-actions setup__start">
        <button type="button" ref={editButtonRef} className="setup-button" onClick={() => setEditing(true)}>
          Edit rules
        </button>
        <button
          type="button"
          className="setup-button setup-button--primary setup-button--large"
          onClick={() => {
            const finished = finalizeFamilies(families);
            onStart(
              champion
                ? {
                    rules,
                    families: [structuredClone(champion.family), finished[1]],
                    championReturning: true,
                  }
                : { rules, families: finished },
            );
          }}
        >
          Start game
        </button>
      </div>
    </section>
  );
}
