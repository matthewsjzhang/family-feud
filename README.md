# family-feud

A browser version of Family Feud that follows the rules of the modern TV show (seasons 16–26). It uses a host console and a separate game board window for a TV.

## Question bank

Two banks, both scraped from [mstiescott.neocities.org](https://mstiescott.neocities.org), seasons 16–26:

- `data/question_bank.json`: 8,907 surveys with 4–8 answers (pages `feud{season}_{4..8}`), used for the main rounds and Fast Money.
- `data/sudden_death_bank.json`: 456 single-answer surveys (pages `feud{season}_1`), used only for Sudden Death. The site shows their totals tripled, since Sudden Death is played for triple points.

- `npm run bank:scrape` rebuilds both banks.
- `npm run bank:verify` spot-checks the main bank against the live site; add `-- --bank data/sudden_death_bank.json` for the Sudden Death bank.
- Surveys with typos on the source site carry `reviewFlags` and are never played.

## Development

```bash
npm install
npm test
npm run test:e2e
npm run dev
```

Open the dev server's URL for the host console, then click **Open game board** and put that window on the TV. Both windows must be in the same browser. Click **Click to enable sound** on the board once: browsers block audio in a window that hasn't been clicked.

The first `npm run test:e2e` needs Playwright's browser: `npx playwright install chromium`.

See [docs/PLAN.md](docs/PLAN.md) for the rules, presets and build plan.
