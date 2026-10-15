// Before the game: name the two families and their players, and pick (or edit) the rules preset.

import { useEffect, useId, useRef, useState } from "react";
import type { FamilySetup, GameSetup } from "../../app/useGameHost";
import { createPresetStore, localPresetStorage, type PresetStore } from "../../engine/presets";
import { DEFAULT_RULES } from "../../engine/rules";
import { RulesEditor } from "./RulesEditor";
import { FamilyPanel } from "./setup/FamilyPanel";
import { summarizePreset } from "./setup/presetSummary";
import { defaultFamilies, finalizeFamilies, loadSetup, saveSetup } from "./setup/setupStorage";
import "./setup.css";

export interface SetupScreenProps {
  onStart(setup: GameSetup): void;
  /** Where presets come from; tests inject an in-memory store. */
  presetStore?: PresetStore;
}

export function SetupScreen({ onStart, presetStore }: SetupScreenProps) {
  const id = useId();
  const [store] = useState(() => presetStore ?? createPresetStore(localPresetStorage()));
  const [saved] = useState(loadSetup);
  const [presetId, setPresetId] = useState(() =>
    saved.presetId && store.get(saved.presetId) ? saved.presetId : DEFAULT_RULES.id,
  );
  const [families, setFamilies] = useState<[FamilySetup, FamilySetup]>(() => saved.families ?? defaultFamilies());
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

      <div className="setup__families">
        <FamilyPanel team={0} family={families[0]} onChange={(f) => setFamily(0, f)} />
        <FamilyPanel team={1} family={families[1]} onChange={(f) => setFamily(1, f)} />
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
          onClick={() => onStart({ rules, families: finalizeFamilies(families) })}
        >
          Start game
        </button>
      </div>
    </section>
  );
}
