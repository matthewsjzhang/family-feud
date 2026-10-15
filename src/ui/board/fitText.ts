// Picks a font size from text length instead of measuring the DOM: it works the
// same on every screen (sizes are in container units) and in jsdom tests.

export interface FitOptions {
  /** Font size (cqw) for short text. */
  base: number;
  /** How many characters fit on one line at the base size. */
  fitChars: number;
  /** Never go below this (cqw); text past this point wraps or is clipped. */
  min: number;
}

export function fitFontSize(text: string, { base, fitChars, min }: FitOptions): number {
  const len = Math.max(1, text.length);
  return Math.max(min, Math.min(base, (base * fitChars) / len));
}

/** Answer tiles: one line up to ~18 chars, then two smaller lines (long survey answers run ~30-40 chars). */
export function answerTextStyle(text: string): { fontSize: string; twoLines: boolean } {
  if (text.length <= 18) {
    return { fontSize: `${fitFontSize(text, { base: 2.8, fitChars: 14, min: 2.1 })}cqw`, twoLines: false };
  }
  return { fontSize: `${fitFontSize(text, { base: 2.1, fitChars: 34, min: 1.5 })}cqw`, twoLines: true };
}
