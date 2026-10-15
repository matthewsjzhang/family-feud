// Answer matcher: suggests which board answer a spoken guess matches.
// The host always has the final say; when two answers fit equally well the
// matcher declines to guess rather than risk suggesting the wrong one.

import { acceptedSpellings, normalize } from "../data/answers";

/** Suggestions below this score are not offered. */
export const MATCH_THRESHOLD = 0.75;
/** Two answers closer than this are too close to call. */
const AMBIGUITY_MARGIN = 0.05;

export interface MatchCandidate {
  index: number;
  score: number;
}

export interface MatchResult {
  /** Suggested board answer, or null for "not on the board" / too close to call. */
  index: number | null;
  /** Score of the best candidate, 0-1. */
  confidence: number;
  ambiguous: boolean;
  /** Every board answer that scored above zero, best first. */
  candidates: MatchCandidate[];
}

export interface MatchOptions {
  /** Board answers to ignore, e.g. ones already revealed. */
  exclude?: readonly number[];
}

/** Words that carry no meaning in a survey answer. */
const STOPWORDS = new Set(
  ("a an the my your his her their our its it i me you he she they them we us theyre im youre " +
    "to of at in on for with as and or some just really very too so " +
    "do does doing did get gets getting got go goes going be being is are was were has have had day").split(" "),
);

/** Words that mean the same thing in survey answers. */
const SAME_WORD: Record<string, string> = {
  not: "no",
  none: "no",
  itself: "self",
  himself: "self",
  herself: "self",
  myself: "self",
  yourself: "self",
  themselves: "self",
  oneself: "self",
};

const undouble = (w: string) => (/([b-df-hj-np-tv-z])\1$/.test(w) ? w.slice(0, -1) : w);

/** Light English stemmer: enough to line up "smoking"/"smoke", "lies"/"lying", "kissed"/"kiss". */
export function stem(word: string): string {
  let w = (SAME_WORD[word] ?? word).replace(/ph/g, "f");
  if (w.length <= 3) return w;
  if (w.length === 5 && w.endsWith("ying")) return `${w[0]}ie`; // lying, dying, tying
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed") && !w.endsWith("eed")) w = w.slice(0, -2); // not "speed"
  else if (/(ss|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  // Always drop a doubled final consonant so "kiss"/"kissed" and "purr"/"purring" line up.
  return undouble(w);
}

interface Token {
  stem: string;
  /** Length of the word as said, before stemming. */
  length: number;
}

function tokens(normalized: string): Token[] {
  const words = normalized.split(" ").filter(Boolean);
  const content = words.filter((w) => !STOPWORDS.has(w));
  return (content.length ? content : words).map((w) => ({ stem: stem(w), length: w.length }));
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** Same word, allowing one typo in words of 5+ letters and two in 8+. */
function sameToken(a: Token, b: Token): boolean {
  if (a.stem === b.stem) return true;
  const shorter = Math.min(a.stem.length, b.stem.length);
  const allowed = shorter >= 8 ? 2 : shorter >= 5 ? 1 : 0;
  return allowed > 0 && editDistance(a.stem, b.stem) <= allowed;
}

/** How many of `want` appear in `have` (each word used once). */
function countShared(want: Token[], have: Token[]): number {
  const unused = [...have];
  let shared = 0;
  for (const w of want) {
    const at = unused.findIndex((h) => sameToken(w, h));
    if (at >= 0) {
      unused.splice(at, 1);
      shared += 1;
    }
  }
  return shared;
}

/** Score one guess against one accepted spelling, 0-1. */
function scoreSpelling(guess: Token[], spelling: Token[]): number {
  const joined = (t: Token[]) => t.map((x) => x.stem).join("");
  if (joined(guess) === joined(spelling)) return 1; // also "chain saw" = "chainsaw"

  const said = countShared(spelling, guess);
  const scores = [0];

  // The guess says every word of the answer, maybe with extras: "fake a cough" = COUGH.
  if (said === spelling.length) {
    const extra = guess.length - spelling.length;
    scores.push(extra === 0 ? 0.98 : Math.max(0.8, 0.9 - 0.03 * (extra - 1)));
  }

  // Every word of the guess is in the answer and one is substantial: "stocks" = STOCK MARKET.
  const covered = countShared(guess, spelling);
  if (covered === guess.length && guess.some((t) => t.length >= 5)) scores.push(0.76);

  // Same main noun (last word) with a different describing word: "lawn mower" = RIDING MOWER.
  const lastGuess = guess.at(-1)!;
  const lastSpelling = spelling.at(-1)!;
  if (
    (guess.length > 1 || spelling.length > 1) &&
    Math.min(lastGuess.length, lastSpelling.length) >= 4 &&
    sameToken(lastGuess, lastSpelling)
  ) {
    scores.push(0.78);
  }

  // Partial word overlap, and whole-phrase typos.
  scores.push(((2 * said) / (guess.length + spelling.length)) * 0.9);
  const a = joined(guess);
  const b = joined(spelling);
  const similarity = 1 - editDistance(a, b) / Math.max(a.length, b.length);
  if (similarity >= 0.85) scores.push(similarity * 0.95);

  return Math.max(...scores);
}

const spellingCache = new Map<string, Token[][]>();

function spellingsFor(boardText: string): Token[][] {
  let cached = spellingCache.get(boardText);
  if (!cached) {
    cached = acceptedSpellings(boardText).map(tokens);
    spellingCache.set(boardText, cached);
  }
  return cached;
}

export function matchAnswer(
  answers: readonly { text: string }[],
  guess: string,
  options: MatchOptions = {},
): MatchResult {
  const normalized = normalize(guess);
  if (!normalized) return { index: null, confidence: 0, ambiguous: false, candidates: [] };
  const guessTokens = tokens(normalized);
  const excluded = new Set(options.exclude ?? []);

  const candidates = answers
    .map((answer, index) => ({
      index,
      score: excluded.has(index) ? 0 : Math.max(...spellingsFor(answer.text).map((s) => scoreSpelling(guessTokens, s))),
    }))
    .filter((c) => c.score > 0)
    .sort((x, y) => y.score - x.score);

  const [best, second] = candidates;
  if (!best || best.score < MATCH_THRESHOLD) {
    return { index: null, confidence: best?.score ?? 0, ambiguous: false, candidates };
  }
  const ambiguous = !!second && best.score < 1 && best.score - second.score < AMBIGUITY_MARGIN;
  return { index: ambiguous ? null : best.index, confidence: best.score, ambiguous, candidates };
}

/** Do two guesses amount to the same answer? (Fast Money duplicates.) */
export function sameAnswer(answers: readonly { text: string }[], a: string, b: string): boolean {
  if (normalize(a) === normalize(b)) return true;
  const ta = tokens(normalize(a));
  const tb = tokens(normalize(b));
  if (ta.length && scoreSpelling(ta, tb) >= 0.98) return true; // "hamster" vs "hamsters"
  const first = matchAnswer(answers, a).index;
  return first !== null && first === matchAnswer(answers, b).index;
}
