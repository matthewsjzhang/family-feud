// Turns board answers ("PET/RUB BELLY", "MTN. LION") into the spellings a
// player might actually say. The board itself always shows the original text.

/** Abbreviations found in the bank (only expanded when written with a period). */
const ABBREVIATIONS: Record<string, string> = {
  acct: "account",
  accts: "accounts",
  anniv: "anniversary",
  appt: "appointment",
  apt: "apartment",
  asst: "assistant",
  attn: "attention",
  choc: "chocolate",
  co: "company",
  croc: "crocodile",
  ctl: "control",
  ctr: "center",
  dept: "department",
  dr: "doctor",
  elec: "electric",
  equip: "equipment",
  fri: "friday",
  ft: "feet",
  jr: "junior",
  lang: "language",
  lb: "pound",
  lbs: "pounds",
  lic: "license",
  mag: "magazine",
  min: "minute",
  mt: "mount",
  mtg: "meeting",
  mtn: "mountain",
  no: "number",
  ofc: "office",
  ph: "phone",
  phys: "physical",
  pkg: "package",
  prob: "problem",
  rm: "room",
  soc: "social",
  st: "street",
  stn: "station",
  surg: "surgery",
  svc: "service",
  tkt: "ticket",
  wt: "weight",
  yr: "year",
};

const SYMBOLS: [RegExp, string][] = [
  [/&/g, " and "],
  [/\$/g, " money "],
  [/#/g, " number "],
  [/%/g, " percent "],
];

function clean(text: string): string {
  let out = text.toLowerCase();
  for (const [pattern, word] of SYMBOLS) out = out.replace(pattern, word);
  out = out
    .replace(/\b([a-z])\.(?=[a-z]\.)/g, "$1") // r.v. -> rv.
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9'. ]/g, " ")
    .replace(/'/g, "");
  return out;
}

const tidy = (text: string) => text.replace(/\./g, " ").replace(/\s+/g, " ").trim();

/** Canonical form used for comparing answers: lowercase words, no punctuation. */
export function normalize(text: string): string {
  return tidy(clean(text));
}

function expand(text: string): string {
  return tidy(clean(text).replace(/\b([a-z]+)\./g, (word, stem: string) => ABBREVIATIONS[stem] ?? word));
}

/** Every spelling that should count as this board answer. */
export function acceptedSpellings(boardText: string): string[] {
  const parts = boardText.split("/");
  const forms = [...parts.flatMap((p) => [normalize(p), expand(p)]), normalize(boardText)];
  return [...new Set(forms.filter(Boolean))];
}
