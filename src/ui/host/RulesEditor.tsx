// Edit, copy, delete, import and export rule presets.
// Built-in presets are read-only: the host copies one first, then edits the copy.

import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { newPresetId, type PresetStore } from "../../engine/presets";
import { BANK_MAX_ANSWERS, BANK_MIN_ANSWERS, validateRules, type GameRules } from "../../engine/rules";
import { NumberField } from "./setup/NumberField";
import { RoundsEditor } from "./setup/RoundsEditor";
import { copyName, toDraft, toRules, type RulesDraft } from "./setup/rulesDraft";
import "./setup.css";

export interface RulesEditorProps {
  store: PresetStore;
  presetId: string;
  /** A preset was created or changed (save, copy, import): list and select it. */
  onSaved(id: string): void;
  onDeleted(id: string): void;
  onClose(): void;
}

function fileName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "preset"}.json`;
}

function download(json: string, name: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function RulesEditor({ store, presetId, onSaved, onDeleted, onClose }: RulesEditorProps) {
  const id = useId();
  const [currentId, setCurrentId] = useState(presetId);
  const preset = store.get(currentId);
  const [draft, setDraft] = useState<RulesDraft | null>(() => (preset ? toDraft(preset) : null));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const focusNameNext = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    // After "Copy to edit" the button that had focus is gone; continue at the name field.
    if (focusNameNext.current) {
      focusNameNext.current = false;
      nameRef.current?.focus();
    }
  }, [currentId]);

  const load = (next: GameRules, message: string) => {
    setCurrentId(next.id);
    setDraft(toDraft(next));
    setDirty(false);
    setActionError(null);
    setStatus(message);
    onSaved(next.id);
  };

  const close = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to this preset?")) return;
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  if (!preset || !draft) {
    return (
      <section className="rules-editor" aria-labelledby={`${id}-title`} onKeyDown={onKeyDown}>
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>
          Preset not found
        </h2>
        <button type="button" className="setup-button" onClick={onClose}>
          Close
        </button>
      </section>
    );
  }

  const readOnly = preset.builtIn;
  const rules = toRules(draft, preset.id);
  const errors = readOnly ? [] : validateRules(rules);
  const valid = errors.length === 0;
  const takenNames = () => store.list().map((p) => p.name);

  const edit = (change: (d: RulesDraft) => RulesDraft) => {
    setDraft((d) => (d ? change(d) : d));
    setDirty(true);
    setStatus(null);
    setActionError(null);
  };

  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      setStatus(null);
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const copyToEdit = () =>
    attempt(() => {
      const copy = store.copy(preset.id, copyName(preset.name, takenNames()));
      focusNameNext.current = true;
      load(copy, `Copied. You're now editing "${copy.name}".`);
    });

  const save = () =>
    attempt(() => {
      store.save(rules);
      load(rules, "Saved.");
    });

  const saveAsNew = () =>
    attempt(() => {
      const taken = takenNames();
      const name = taken.includes(rules.name) ? copyName(rules.name, taken) : rules.name;
      const created = { ...rules, id: newPresetId(), name };
      store.save(created);
      load(created, `Saved as "${name}".`);
    });

  const remove = () => {
    if (!window.confirm(`Delete the preset "${preset.name}"? This can't be undone.`)) return;
    attempt(() => {
      store.remove(preset.id);
      onDeleted(preset.id);
    });
  };

  const exportPreset = () => attempt(() => download(store.exportJson(preset.id), fileName(preset.name)));

  const importPreset = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (dirty && !window.confirm("Discard your unsaved changes and open the imported preset?")) {
      input.value = "";
      return;
    }
    try {
      const imported = store.importJson(await file.text());
      load(imported, `Imported "${imported.name}".`);
    } catch (error) {
      setStatus(null);
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      input.value = ""; // so picking the same file again still fires a change
    }
  };

  const sd = draft.suddenDeath;
  const fm = draft.fastMoney;
  const isTarget = draft.winType === "target";

  return (
    <section className="rules-editor" aria-labelledby={`${id}-title`} onKeyDown={onKeyDown}>
      <header className="rules-editor__header">
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1}>
          {readOnly ? `Rules: ${preset.name}` : `Edit rules: ${preset.name}`}
        </h2>
        <button type="button" className="setup-button" onClick={close}>
          Back to setup
        </button>
      </header>

      {readOnly && (
        <div className="rules-editor__notice" role="note">
          <p>
            <strong>Built-in presets are read-only.</strong> Make a copy to change the rules; the original stays as it
            is.
          </p>
          <button type="button" className="setup-button setup-button--primary" onClick={copyToEdit}>
            Copy to edit
          </button>
        </div>
      )}

      <fieldset className="rules-editor__form" disabled={readOnly}>
        <legend className="setup-visually-hidden">Preset settings</legend>

        <div className="setup-field">
          <label htmlFor={`${id}-name`}>Preset name</label>
          <input
            id={`${id}-name`}
            ref={nameRef}
            type="text"
            value={draft.name}
            autoComplete="off"
            onChange={(e) => {
              const name = e.target.value;
              edit((d) => ({ ...d, name }));
            }}
          />
        </div>

        <RoundsEditor rounds={draft.rounds} onChange={(rounds) => edit((d) => ({ ...d, rounds }))} />

        <fieldset className="rules-editor__group">
          <legend>Win condition</legend>
          <div className="rules-editor__choice">
            <input
              id={`${id}-win-target`}
              type="radio"
              name={`${id}-win`}
              checked={isTarget}
              onChange={() => edit((d) => ({ ...d, winType: "target" }))}
            />
            <label htmlFor={`${id}-win-target`}>First to a target score</label>
          </div>
          <NumberField
            className="rules-editor__indent"
            label="Target score (points)"
            min={1}
            value={draft.target}
            disabled={!isTarget}
            onChange={(target) => edit((d) => ({ ...d, target }))}
          />
          <div className="rules-editor__choice">
            <input
              id={`${id}-win-highest`}
              type="radio"
              name={`${id}-win`}
              checked={!isTarget}
              onChange={() => edit((d) => ({ ...d, winType: "highestScore" }))}
            />
            <label htmlFor={`${id}-win-highest`}>Highest score after the last round</label>
          </div>
          <div className="rules-editor__choice">
            <input
              id={`${id}-repeat`}
              type="checkbox"
              checked={isTarget && draft.repeatLastRound}
              disabled={!isTarget}
              aria-describedby={`${id}-repeat-hint`}
              onChange={(e) => {
                const repeatLastRound = e.target.checked;
                edit((d) => ({ ...d, repeatLastRound }));
              }}
            />
            <label htmlFor={`${id}-repeat`}>Repeat the last round until someone reaches the target</label>
          </div>
          <p id={`${id}-repeat-hint`} className="setup-hint">
            Only works with a target score.
          </p>
        </fieldset>

        <fieldset className="rules-editor__group">
          <legend>Sudden Death</legend>
          <div className="rules-editor__choice">
            <input
              id={`${id}-sd`}
              type="checkbox"
              checked={sd.enabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                edit((d) => ({ ...d, suddenDeath: { ...d.suddenDeath, enabled } }));
              }}
            />
            <label htmlFor={`${id}-sd`}>Play Sudden Death</label>
          </div>
          <div className="rules-editor__row">
            <NumberField
              label="Multiplier (×)"
              min={1}
              value={sd.multiplier}
              disabled={!sd.enabled}
              onChange={(multiplier) => edit((d) => ({ ...d, suddenDeath: { ...d.suddenDeath, multiplier } }))}
            />
            <NumberField
              label="Min answers"
              min={BANK_MIN_ANSWERS}
              max={BANK_MAX_ANSWERS}
              value={sd.minAnswers}
              disabled={!sd.enabled}
              onChange={(minAnswers) => edit((d) => ({ ...d, suddenDeath: { ...d.suddenDeath, minAnswers } }))}
            />
            <NumberField
              label="Max answers"
              min={BANK_MIN_ANSWERS}
              max={BANK_MAX_ANSWERS}
              value={sd.maxAnswers}
              disabled={!sd.enabled}
              onChange={(maxAnswers) => edit((d) => ({ ...d, suddenDeath: { ...d.suddenDeath, maxAnswers } }))}
            />
          </div>
        </fieldset>

        <fieldset className="rules-editor__group">
          <legend>Fast Money</legend>
          <div className="rules-editor__choice">
            <input
              id={`${id}-fm`}
              type="checkbox"
              checked={fm.enabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                edit((d) => ({ ...d, fastMoney: { ...d.fastMoney, enabled } }));
              }}
            />
            <label htmlFor={`${id}-fm`}>Play Fast Money</label>
          </div>
          <div className="rules-editor__row">
            <NumberField
              label="Target (points)"
              min={1}
              value={fm.target}
              disabled={!fm.enabled}
              onChange={(target) => edit((d) => ({ ...d, fastMoney: { ...d.fastMoney, target } }))}
            />
            <NumberField
              label="Grand prize ($)"
              prefix="$"
              min={0}
              value={fm.grandPrize}
              disabled={!fm.enabled}
              onChange={(grandPrize) => edit((d) => ({ ...d, fastMoney: { ...d.fastMoney, grandPrize } }))}
            />
            <NumberField
              label="$ per point"
              prefix="$"
              min={0}
              value={fm.perPoint}
              disabled={!fm.enabled}
              onChange={(perPoint) => edit((d) => ({ ...d, fastMoney: { ...d.fastMoney, perPoint } }))}
            />
            <NumberField
              label="Player 1 timer (seconds)"
              min={1}
              value={fm.timer1}
              disabled={!fm.enabled}
              onChange={(timer1) => edit((d) => ({ ...d, fastMoney: { ...d.fastMoney, timer1 } }))}
            />
            <NumberField
              label="Player 2 timer (seconds)"
              min={1}
              value={fm.timer2}
              disabled={!fm.enabled}
              onChange={(timer2) => edit((d) => ({ ...d, fastMoney: { ...d.fastMoney, timer2 } }))}
            />
          </div>
        </fieldset>

        <fieldset className="rules-editor__group">
          <legend>Champions</legend>
          <div className="rules-editor__choice">
            <input
              id={`${id}-nolimit`}
              type="checkbox"
              checked={draft.noChampionLimit}
              onChange={(e) => {
                const noChampionLimit = e.target.checked;
                edit((d) => ({ ...d, noChampionLimit }));
              }}
            />
            <label htmlFor={`${id}-nolimit`}>No limit: champions never retire</label>
          </div>
          <NumberField
            label="Retire after this many wins"
            min={1}
            value={draft.championLimit}
            disabled={draft.noChampionLimit}
            onChange={(championLimit) => edit((d) => ({ ...d, championLimit }))}
          />
        </fieldset>
      </fieldset>

      <div className="rules-editor__footer">
        {!readOnly && (
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
        )}
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
          {!readOnly && (
            <>
              <button
                type="button"
                className="setup-button setup-button--primary"
                disabled={!valid}
                aria-describedby={`${id}-errors`}
                onClick={save}
              >
                Save
              </button>
              <button
                type="button"
                className="setup-button"
                disabled={!valid}
                aria-describedby={`${id}-errors`}
                onClick={saveAsNew}
              >
                Save as new
              </button>
            </>
          )}
          <button type="button" className="setup-button" onClick={exportPreset}>
            Export
          </button>
          <label className="setup-button setup-file">
            Import…
            <input type="file" accept=".json,application/json" className="setup-visually-hidden" onChange={importPreset} />
          </label>
          {!readOnly && (
            <button type="button" className="setup-button setup-button--danger" onClick={remove}>
              Delete
            </button>
          )}
          <button type="button" className="setup-button" onClick={close}>
            {dirty ? "Cancel" : "Close"}
          </button>
        </div>
        {dirty && <p className="setup-hint">Export saves the last saved version, not unsaved changes.</p>}
      </div>
    </section>
  );
}
