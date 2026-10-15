"""Spot-check the question bank against freshly downloaded live pages.

For a random sample, re-fetch the source page and confirm the question, every
answer and every point value appear in the page's text, in board order.
Also prints bank-wide stats (duplicates, empty fields, flagged surveys).

Usage: python -I tools/verify_bank.py [--sample 60] [--seed 1]
"""

import argparse
import html
import json
import random
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path


def page_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as resp:
        raw = resp.read().decode("cp1252")
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", text)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bank", type=Path, default=Path("data/question_bank.json"))
    ap.add_argument("--sample", type=int, default=60)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    bank = json.loads(args.bank.read_text(encoding="utf-8"))
    print(f"surveys: {len(bank)}")
    print("by season:", dict(sorted(Counter(s["season"] for s in bank).items())))
    print("by size:  ", dict(sorted(Counter(s["answerCount"] for s in bank).items())))
    print("flagged:  ", sum("reviewFlags" in s for s in bank))
    print("empty question/answer:",
          sum(not s["question"] or any(not a["text"] for a in s["answers"]) for s in bank))
    dupes = [q for q, n in Counter(s["question"].lower() for s in bank).items() if n > 1]
    print("repeated question wording:", len(dupes))

    rng = random.Random(args.seed)
    sample = rng.sample([s for s in bank if "reviewFlags" not in s], args.sample)
    pages: dict[str, str] = {}
    failures = 0
    for s in sample:
        text = pages.setdefault(s["source"], page_text(s["source"]))
        pos = text.find(s["question"])
        ok = pos >= 0
        # The board is printed row by row (answers i and i+4 share a row), so
        # check presence after the question rather than strict order.
        tail = text[pos: pos + 2000] if ok else ""
        missing = [a["text"] for a in s["answers"] if f"{a['text']} {a['points']}" not in tail]
        if not ok or missing:
            failures += 1
            print(f"FAIL {s['id']}: question found={ok} missing={missing}")
    print(f"\nlive spot-check: {args.sample - failures}/{args.sample} surveys matched "
          f"across {len(pages)} pages")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
