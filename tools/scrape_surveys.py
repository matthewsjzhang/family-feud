"""Build the Family Feud question bank from mstiescott.neocities.org.

Pages are https://mstiescott.neocities.org/feud{season}_{answers}. Each page
lists many surveys; each survey is a question, a score box (points total) and
a two-column board whose left column holds answers 1-4 and right column 5-8.

Two banks are built: the main bank from the 4-8 answer pages, and a separate
Sudden Death bank from the single-answer pages (feud{season}_1).

Usage:
    python -I tools/scrape_surveys.py [--raw DIR] [--out data/question_bank.json]
        [--sudden-death-out data/sudden_death_bank.json]

With --raw, pages are read from DIR/feud{s}_{n}.html instead of downloaded.
"""

import argparse
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

BASE_URL = "https://mstiescott.neocities.org/feud{season}_{answers}"
SEASONS = range(16, 27)  # 16..26 inclusive
ANSWER_COUNTS = range(4, 9)  # 4..8 inclusive: main game surveys
SUDDEN_DEATH_COUNTS = range(1, 2)  # feud{season}_1: single-answer Sudden Death surveys

# Each survey is three tables in a row: question (570 wide), score box (172),
# board (542). Markup inside them differs between seasons, so anchor on these.
QUESTION_TABLE = re.compile(r"<TABLE WIDTH=570 BORDER=0 CELLPADDING=0[^>]*>(.*?)</TABLE>", re.I | re.S)
SCORE_TABLE = re.compile(r"<TABLE WIDTH=172[^>]*>(.*?)</TABLE>", re.I | re.S)
BOARD_TABLE = re.compile(r"<TABLE WIDTH=542[^>]*>(.*?)</TABLE>", re.I | re.S)
TAG = re.compile(r"<[^>]+>")
ROW = re.compile(r"<TR>(.*?)</TR>", re.I | re.S)
CELL = re.compile(r"<TD([^>]*)>(.*?)</TD>", re.I | re.S)


def clean(fragment: str) -> str:
    text = html.unescape(TAG.sub(" ", fragment)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def fetch(season: int, answers: int, raw_dir: Path | None) -> str:
    if raw_dir:
        return (raw_dir / f"feud{season}_{answers}.html").read_bytes().decode("cp1252")
    url = BASE_URL.format(season=season, answers=answers)
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read().decode("cp1252")


def parse_board(board_html: str) -> list[tuple[str, str]]:
    """Return (answer, raw points) in board order: left column top-down, then right."""
    columns: list[list[tuple[str, str]]] = [[], []]
    for row in ROW.findall(board_html):
        col = 0
        pending_text = None
        for attrs, body in CELL.findall(row):
            if "COLSPAN" in attrs.upper():  # unrevealed/empty slot
                col += 1
                continue
            text = clean(body)
            if pending_text is None:
                pending_text = text
            else:
                columns[col].append((pending_text, text))
                pending_text = None
                col += 1
    return columns[0] + columns[1]


def parse_page(page: str, season: int, answers: int) -> tuple[list[dict], list[str]]:
    surveys, problems = [], []
    page_id = f"feud{season}_{answers}"
    # The question is the last 570-wide table before each score box.
    score_boxes = list(SCORE_TABLE.finditer(page))
    for idx, score in enumerate(score_boxes, 1):
        prev_end = score_boxes[idx - 2].end() if idx > 1 else 0
        questions = QUESTION_TABLE.findall(page, prev_end, score.start())
        board = BOARD_TABLE.search(page, score.end())
        if not questions or not board:
            problems.append(f"{page_id} #{idx}: missing question/board")
            continue
        # Drop the trailing spacer (<FONT SIZE=1>&nbsp;); keep multi-line setups
        # such as "We asked 100 married men... Fill in the blank: ...".
        question = clean(re.split(r"<FONT SIZE=1>", questions[-1], flags=re.I)[0])
        total_text = clean(score.group(1))
        entries = parse_board(board.group(1))
        flags = []

        # Some pages have typos (e.g. "S3"); keep the digits but flag for review.
        answers_out = []
        for text, raw in entries:
            digits = re.sub(r"\D", "", raw)
            if digits != raw:
                flags.append(f"points {raw!r} for {text!r} read as {digits or '?'}")
            answers_out.append({"text": text, "points": int(digits) if digits else None})
        total = int(re.sub(r"\D", "", total_text) or 0)
        points = [a["points"] or 0 for a in answers_out]

        if len(entries) != answers:
            flags.append(f"{len(entries)} answers on a {answers}-answer page")
        if points != sorted(points, reverse=True):
            flags.append(f"points not descending {points}")
        if sum(points) > total:
            flags.append(f"sum {sum(points)} > total {total}")

        survey = {
            "id": f"s{season}-a{answers}-{idx:03d}",
            "season": season,
            "answerCount": answers,
            "question": question,
            "total": total,
            "answers": answers_out,
            "source": BASE_URL.format(season=season, answers=answers),
        }
        if flags:
            survey["reviewFlags"] = flags
            problems.extend(f"{survey['id']}: {f} ({question[:50]!r})" for f in flags)
        surveys.append(survey)
    return surveys, problems


def build(answer_counts: range, raw: Path | None, out: Path) -> None:
    bank, problems = [], []
    for season in SEASONS:
        for answers in answer_counts:
            surveys, page_problems = parse_page(fetch(season, answers, raw), season, answers)
            print(f"feud{season}_{answers}: {len(surveys)} surveys")
            bank.extend(surveys)
            problems.extend(page_problems)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bank, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(bank)} surveys written to {out}")
    if problems:
        print(f"{len(problems)} problems:", *problems, sep="\n  ")
    print()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, help="directory of pre-downloaded pages")
    ap.add_argument("--out", type=Path, default=Path("data/question_bank.json"))
    ap.add_argument("--sudden-death-out", type=Path, default=Path("data/sudden_death_bank.json"))
    args = ap.parse_args()

    build(ANSWER_COUNTS, args.raw, args.out)
    # Single-answer surveys, used only for Sudden Death. Their score box shows
    # the answer's points tripled, as Sudden Death is played for triple points.
    build(SUDDEN_DEATH_COUNTS, args.raw, args.sudden_death_out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
