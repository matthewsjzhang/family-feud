// A labelled whole-number input that hands back the raw text, so the draft can
// hold half-typed values and validation (not clamping) reports bad ones.

import { useId } from "react";

export interface NumberFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Short text shown before the input, e.g. "$". */
  prefix?: string;
  className?: string;
}

export function NumberField({ label, value, onChange, min, max, disabled, prefix, className }: NumberFieldProps) {
  const id = useId();
  return (
    <div className={`setup-field setup-field--number ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      <span className="setup-field__input-wrap">
        {prefix && (
          <span className="setup-field__prefix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          inputMode="numeric"
          step={1}
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </div>
  );
}
