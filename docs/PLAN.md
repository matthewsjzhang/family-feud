# Plan: Family Feud (faithful to the modern syndicated show)

**Complexity:** Medium-Large · **Status:** awaiting confirmation · **Data:** `data/question_bank.json` (8,907 surveys) and `data/sudden_death_bank.json` (456 single-answer surveys), done and verified

## 1. Requirements restatement

Build a playable Family Feud game that follows the real show's rules, round order and scoring as closely as possible, as played in seasons 16–26 (the Steve Harvey era, which is where every survey in the bank comes from).

### The rules we will replicate

**Setup**
- Two families of 5 players each.

**Main game (first family to 300 points wins)**

| Order | Round | Point multiplier | Survey size we pull from the bank |
|---|---|---|---|
| 1 | Round 1 | Single (×1) | 6–8 answers |
| 2 | Round 2 | Single (×1) | 5–8 answers |
| 3 | Round 3 | Double (×2) | 4–6 answers |
| 4 | Round 4 | Triple (×3) | 4–5 answers |
| last | Sudden Death | Triple (×3) | Single-answer question from the separate Sudden Death bank |

- A family that has 300 or more at the end of any round wins. If neither family is at 300 after the triple round, Sudden Death decides the game. The triple round is not repeated.
- This table is the **Default** preset. Every value in it can be changed; see "Game rules and presets" below.

**Game rules and presets**

The engine never hard-codes the round table above. It reads a `GameRules` object, which the host picks or edits on the setup screen before the game starts.

| Setting | What you can change | Default preset |
|---|---|---|
| Rounds | Add, remove or reorder rounds | 4 rounds, then Sudden Death |
| Each round | Name, point multiplier (any whole number), survey size range | As in the table above |
| Last round repeats | Whether the last round repeats until someone reaches the target (only with a target score) | Off |
| Win condition | First to a target score, or highest score after the last round | First to 300 |
| Sudden Death | On or off, and its multiplier | On, ×3 |
| Fast Money | On or off, target, grand prize, $ per point, two timers | On, 200, $20,000, $5, 20 s / 25 s |
| Champions | Games before a family retires (or no limit) | 5 |

Built-in presets (read-only, but can be copied and edited):

| Preset | Rounds | Win condition |
|---|---|---|
| **Default** | Single, Single, Double, Triple, then Sudden Death | First to 300 |
| **Single points** | Every round ×1, last round repeats until someone reaches 300 | First to 300 |
| **Fixed rounds** | 5 rounds at ×1, no repeats; Sudden Death only breaks a tie | Highest score after round 5 |

A rule set must always produce a winner, so the validator requires Sudden Death when the game can otherwise end without one: a target score with no repeating round, or "highest score" (to break ties).

Custom presets:
- The host can save their own presets under a name, and edit or delete them later. These are stored in the browser's `localStorage`.
- Presets can be exported to and imported from a JSON file, so they can be moved to another computer.
- The setup screen shows the chosen preset's rounds before the game starts.
- The board's multiplier banner shows the current round's multiplier, so a ×1 game never says "Double".

**Each round**
1. **Face-off.** The next player in each family's rotation goes to the buzzer.
   - Whoever buzzes first answers. A #1 answer wins control right away.
   - Otherwise the other player answers, and the higher-ranked answer wins control.
   - If both miss, the next pair in rotation faces off on the same question.
2. **Play or pass.** The family that wins the face-off chooses to play the question or pass it to the other family.
3. **Playing the board.** The controlling family answers one player at a time, in rotation.
   - A wrong answer is a strike. Three strikes end their turn.
   - Revealing every answer wins the bank.
4. **Steal.** After three strikes, the other family confers and gives one answer.
   - If the answer is on the board, they take the whole bank.
   - If not, the controlling family keeps it.
5. **Scoring and reveal.** The bank is the sum of revealed answers × the round multiplier. After the round is scored, any unrevealed answers are shown, and those points are not awarded.

**Sudden Death**
- A single face-off. Only the #1 answer matters.
- The first player to say it wins the game.

**Fast Money (bonus round for the winning family)**

| Rule | Detail |
|---|---|
| Players | Two players from the winning family |
| Questions | Five survey questions |
| Player 1 | Answers all five questions in 20 seconds while Player 2 is offstage |
| Player 2 | Answers the same five questions in 25 seconds |
| Before Player 2 starts | Player 1's answers and their scores are covered up |
| Duplicate answer | If Player 2 repeats Player 1's answer, a double buzzer sounds and they must try again |
| Skipped questions | Players may pass and return to them if time remains |
| Win condition | 200 combined points or more wins $20,000 |
| Losing payout | $5 per point |

**Champions**
- The winning family returns for the next game.
- A family that wins 5 games retires undefeated.

### Assumptions to confirm
1. **Platform: a browser game.**
   - TypeScript + Vite + React, with tests in Vitest and Playwright.
   - No server, and it runs from `npm run dev` or a static build.
2. **Two screens in one browser:**
   - a **Host console**, where the host reads the question, judges answers, presses strike/reveal and runs the timers;
   - a **Game board** window for a TV or projector, showing the audience view.
   - The two windows stay in sync over `BroadcastChannel`.
   - Free-text play without a host is a later phase that adds automatic answer matching.
3. **Judging answers.**
   - The host judges by default. On the real show, a judge decides whether an answer matches.
   - The automatic matcher helps by suggesting a match, and the host confirms or overrides it.
4. **No trademarked assets.**
   - We use an original look in the style of the show, with no logo.
   - The "ding" and strike buzzer are made with Web Audio rather than copied from the show.

## 2. Pattern grounding

The project is empty apart from the scraper and the data, so **there are no existing patterns to copy**. The rest of the code will follow the conventions this work sets up:
- Python tooling lives in `tools/`, runs as standalone `argparse` scripts and reports to stdout. See `tools/scrape_surveys.py`.
- Data is a JSON array of surveys, each with:
  - `id` (`s{season}-a{n}-{idx}`), `season`, `answerCount` and `question`;
  - `total` (the survey's point total) and `answers` (`[{text, points}]`, in board order);
  - `source` (the page it came from) and, on problem surveys only, `reviewFlags`.

## 3. Files to create

| File | Purpose |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json` | App scaffold |
| `src/data/bank.ts` | Load the bank, drop surveys with `reviewFlags` (17), remove repeated questions (24), pick questions for each round without repeats, and remember used IDs in `localStorage` |
| `src/data/answers.ts` | Turn board answers into accepted spellings: `PET/RUB BELLY` → ["pet", "rub belly"]; abbreviations such as `MTN.` → "mountain" and `ACCT.` → "account" |
| `src/engine/types.ts` | `GameState`, `RoundState`, `FaceOffState`, `FastMoneyState`, and the actions |
| `src/engine/rules.ts` | `GameRules` and `RoundRule` types, the 3 built-in presets, a validator (at least one round, multipliers ≥ 1, valid survey ranges, a way for the game to end) |
| `src/engine/presets.ts` | Save, load, copy, delete, export and import custom presets |
| `src/engine/mainGame.ts` | Pure reducer for face-off, play/pass, strikes, steal and banking. Multipliers, round order, the win condition and Sudden Death all come from `GameRules` |
| `src/engine/fastMoney.ts` | Pure reducer for both players' turns, timers, duplicate check, passes, the 200-point check and the payout |
| `src/engine/match.ts` | Fuzzy matcher: normalize text, strip plurals, edit distance, aliases; returns its best guess and how confident it is |
| `src/engine/*.test.ts` | Unit tests for every rule in §1, written first |
| `src/sync/channel.ts` | `BroadcastChannel` link between the host console and the board |
| `src/ui/host/RulesEditor.tsx` | Preset picker and round editor on the setup screen: add, remove and reorder rounds, set multipliers, save as a new preset |
| `src/ui/host/*` | Host console screens: setup, face-off, board control, steal, Fast Money and a manual score fix |
| `src/ui/board/*` | Audience screens: the 8-slot board, flip animation, strike X's, family scores, bank, Fast Money board |
| `src/audio/sfx.ts` | Web Audio sounds: ding, strike buzzer, Fast Money timer and double buzzer |
| `e2e/*.spec.ts` | Playwright tests: a full game in both windows, a steal, Sudden Death and a Fast Money win and loss |

## 4. Phases

### Phase 1: Data layer (S)
- **Steps:**
  1. Write `bank.ts`, which loads the bank and picks questions for each round by size.
  2. Write `answers.ts`, which builds the list of accepted spellings for each answer.
  3. Sudden Death draws from the separate single-answer bank (`feud{season}_1` pages, 456 surveys). Fast Money draws from the main bank, scored by its board points; an answer that isn't on the board scores 0.
- **Validate:** unit tests that check:
  - no flagged surveys are ever picked;
  - every pick has the right size for its round;
  - no question repeats within a session.

### Phase 2: Main-game engine (M), test first
- **Steps:**
  - Write `rules.ts` first, with the Default, Single points and Fixed rounds presets and the validator.
  - Build the reducer as a state machine that reads its round list, multipliers and win condition from `GameRules`, with these steps:
  1. `setup`
  2. `faceOff`
  3. `playOrPass`
  4. `playing`
  5. `steal`
  6. `roundResolved`
  7. `revealRemaining`
  8. back to `faceOff`, or on to `suddenDeath` or `gameOver`
- **Tests:** one or more for each rule:
  - **Face-off:** the #1 answer wins right away; a higher rank beats a lower one; when both players miss, the next pair steps up.
  - **Strikes:** three strikes start the steal; revealing the whole board wins the bank.
  - **Steal:** a correct steal takes the whole bank; a failed steal leaves it with the controlling family.
  - **Scoring:** the ×1, ×1, ×2 and ×3 multipliers apply; the game ends at 300 or more.
  - **Players:** the rotation keeps going from round to round.
  - **Host:** an undo stack covers mistakes.
  - **Rules:** the Default preset reproduces the show exactly; Single points awards ×1 in every round; Fixed rounds ends after round 5 with the highest score winning, including a tie going to Sudden Death if it is on; the validator rejects a rule set that could never end.
- **Validate:** `npm test`, with at least 90% branch coverage on `engine/`.

### Phase 3: Fast Money engine (S)
- **Steps:**
  1. Run the 20-second and 25-second timers from ticks the host controls.
  2. Handle passes, then let players return to passed questions.
  3. Detect duplicate answers with the same matcher used for judging.
  4. Hide Player 1's answers during Player 2's turn.
  5. Check for 200 points and work out the payout.
- **Validate:** unit tests.

### Phase 4: Answer matcher (S)
- **Steps:**
  1. Normalize answers: lowercase, strip punctuation, make words singular.
  2. Use the accepted spellings from Phase 1.
  3. Match with token overlap plus edit distance.
  - **Results (done):**

    | Check | Target | Tuning fixture (21 surveys) | Held-out (10 surveys, measured once) |
    |---|---|---|---|
    | Regular answers found | ≥ 90% | 169 of 169 | 63 of 67 (94%) |
    | Suggestions that were right | ≥ 97% | 169 of 169 | 65 of 66 (98.5%) |
    | Off-board guesses wrongly matched | ≤ 5% | 0 of 28 | 1 of 16 (6.25%) |

    The one held-out mistake was "talks in sleep" matched to CAN'T SLEEP (same last word). Synonyms ("vet", "fireman") are left to the host.
  4. Handle shared words across a slash, which Phase 1 splits literally. For example, `BRUSH/FLOSS TEETH` should also accept "brush teeth", and `PROSTHETIC LEG/FOOT` should also accept "prosthetic foot".
- **Validate:** a fixture of about 100 real answers from the bank and their likely spoken variants, with a precision target set before tuning.

### Phase 5: Host console and game board UI (L)
- **Steps:**
  1. Board: a 2×4 grid, numbered tiles that flip to reveal the answer and points, and a big red X for each strike, with 1–3 shown together.
  2. Scores on both sides, the round bank and the multiplier banner for each round.
  3. Host console: buttons for every legal action from the engine, with illegal actions disabled.
  4. Keyboard shortcuts: 1–8 reveals an answer and X adds a strike.
  5. Setup screen: preset picker and round editor (`RulesEditor.tsx`), with save, copy, delete, export and import.
- **Validate:** `/run` both windows, then Playwright E2E tests.

### Phase 6: Fast Money UI and audio (M)
- **Steps:**
  1. Build the Fast Money board: 5 rows × 2 columns plus a running total.
  2. Show the 20-second and 25-second countdowns.
  3. Add the sound effects.
- **Validate:** E2E tests for a win and a loss.

### Phase 7: Polish (S)
- **Steps:** add the champion tracking (retire after the preset's win limit) and a question-bank browser for the host.

## 5. Dependencies

- Phase 1 → Phases 2, 3 and 4. After Phase 1, those three can run in parallel.
- Phases 2, 3 and 4 → Phase 5 → Phase 6 → Phase 7.

## 6. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Automatic matching rejects reasonable answers or accepts wrong ones | High | The host's decision is final, and the matcher only suggests. We measure precision on real answers. |
| Board answers are shorthand (`BANK ACCT.`, `ME/MY MATE`) | High | Expand abbreviations and split slashes into accepted spellings. The board still shows the original text, as on the show. |
| Some surveys are adult-themed (the show's own content) | Medium | Add an optional "family-friendly" filter based on a keyword list, off by default. |
| Errors in the source data | Low | 17 flagged surveys are left out. 80 out of 80 random live spot-checks matched. |
| The game drifts from the show's real rules | Medium | Each rule in §1 maps to a named unit test against the Default preset, and every change lives in a separate preset. |
| A custom preset creates a game that never ends or makes no sense | Medium | The validator blocks saving it and says why. |
| Trademark or sound copyright | Low | Original visuals and sounds, with no logo. |

## 7. Estimated effort

| Phase | Hours |
|---|---|
| Phase 1: Data layer | ~2 |
| Phase 2: Main-game engine (incl. rules and presets) | ~6 |
| Phase 3: Fast Money engine | ~2 |
| Phase 4: Answer matcher | ~2 |
| Phase 5: Host console, game board and rules editor UI | ~10 |
| Phase 6: Fast Money UI and audio | ~4 |
| Phase 7: Polish | ~3 |
| **Total** | **≈29** |
