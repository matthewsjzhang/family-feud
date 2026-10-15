# family-feud

A browser version of Family Feud that follows the rules of the modern TV show (seasons 16–26). It uses a host console and a separate game board window for a TV.

## Question bank

`data/question_bank.json` holds 8,907 real surveys from seasons 16–26, each with 4–8 answers. They were scraped from [mstiescott.neocities.org](https://mstiescott.neocities.org) (pages `feud{season}_{answers}`).

- `npm run bank:scrape` rebuilds the bank.
- `npm run bank:verify` spot-checks it against the live site.
- Surveys with typos on the source site carry `reviewFlags` and are never played.

## Development

```bash
npm install
npm test
npm run dev
```

See [docs/PLAN.md](docs/PLAN.md) for the rules, presets and build plan.
