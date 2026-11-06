# -*- coding: utf-8 -*-
"""
Lint the paper-excerpt files of the curated tier (corpus/kb/*.json) for fragments that are
not knowledge: search strategies and PRISMA boilerplate, data tables (columns of numbers),
reference lists, figure/table captions, acknowledgements / conflicts of interest, website
navigation, and anything shorter than 40 words.

    python tool/kb_lint.py                 # report candidates (default: the four excerpt files)
    python tool/kb_lint.py --apply         # remove them; backup → corpus/kb/_removed_2026_11.json
    python tool/kb_lint.py --keep donor_knee:21 --apply   # review override: keep one candidate
    python tool/kb_lint.py --drop donor_knee:8 --apply    # review override: drop one more
    python tool/kb_lint.py --files talus_oat_rehab donor_knee

A candidate is listed with its file, position, chunk_idx, the reasons, and the first 120
characters, so the list can be reviewed before --apply. The backup keeps every removed
fragment together with its reasons; the index under corpus/index_kb rebuilds itself on the
next start because endpoint/kb.py fingerprints the file sizes.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
KB_DIR = ROOT / "corpus" / "kb"
BACKUP = KB_DIR / "_removed_2026_11.json"
DEFAULT_FILES = ["talus_oat_rehab", "donor_knee", "nutrition_supplements", "cartilage_longevity"]

MIN_WORDS = 40

# Manual review of the 2026-11-06 run (every candidate read in full). KEEP = flagged but real
# prose (surgical technique, outcome numbers, grading tables that explain themselves);
# DROP = passed the thresholds but is methods / captions / study-protocol text with no claim.
REVIEW_KEEP = {("talus_oat_rehab", 4), ("donor_knee", 58)}
REVIEW_DROP = {("talus_oat_rehab", 20), ("donor_knee", 41), ("donor_knee", 54),
               ("nutrition_supplements", 28), ("nutrition_supplements", 69), ("nutrition_supplements", 84)}

_SEARCH = re.compile(r"#\s?\d+\s*Search|Search strategy|search(?:ed|ing)? (?:terms?|strings?|strategy)|"
                     r"PRISMA|PROSPERO|MeSH|Rayyan|databases? (?:were|was) searched|(?:MEDLINE|Embase|EMBASE|Cochrane|"
                     r"Scopus|CINAHL|Web of Science)\b", re.I)
_REF = re.compile(r"\bet al\.?,? ?\(?\d{4}\)?|\b[A-Z][A-Za-z'’-]+ (?:&|and) [A-Z][A-Za-z'’-]+ \d{4}\b|"
                  r"\b[A-Z][A-Za-z'’-]+ \d{4} ?[;)]|\bdoi\b|\bPMID\b|\bPMCID\b|https?://doi\.org", re.I)
_FIG = re.compile(r"\b(?:Fig(?:ure|\.)|Table|TABLE)\s*\d|Open in a new tab|flow[- ]?chart", re.I)
_ACK = re.compile(r"Acknowledg(?:e)?ments?|Conflicts? of interest|Competing interests?|Funding(?: statement)?|"
                  r"Author contributions?|Data availability|Ethics statement|Informed consent|"
                  r"Institutional review board|Publisher'?s note|Copyright ©|©|Creative Commons|"
                  r"Supplementary (?:material|data)", re.I)
_NAV = re.compile(r"Skip to (?:main|primary|secondary|content)|navigation|cookies?|Privacy Policy|Subscribe|"
                  r"Sign in|Log in|Helpline|Donate|Newsletter|Site map|Search this site|Menu\b", re.I)
_VERB = re.compile(r"\b(?:is|are|was|were|be|been|has|have|had|show(?:s|ed)?|found|report(?:s|ed)?|increase[sd]?|"
                   r"decrease[sd]?|reduce[sd]?|improve[sd]?|associate[sd]?|suggest(?:s|ed)?|may|can|should|"
                   r"include[sd]?|perform(?:s|ed)?|underw(?:ent|ent)|treat(?:s|ed)?|require[sd]?|lead[s]?|"
                   r"result(?:s|ed)?|compared?|remain(?:s|ed)?|allow(?:s|ed)?|need(?:s|ed)?)\b", re.I)


def _digit_ratio(text: str) -> float:
    chars = [c for c in text if not c.isspace()]
    return sum(c.isdigit() for c in chars) / max(1, len(chars))


def _number_tokens(text: str) -> float:
    """Share of whitespace tokens that are numbers / ranges / 'NR' / '–' — the shape of a data table."""
    toks = text.split()
    numeric = sum(1 for t in toks if re.fullmatch(r"[\d.,%×x/()–\-±]+|NR|NA|M|F|n|N|=|–|-", t))
    return numeric / max(1, len(toks))


def reasons_for(text: str) -> list[str]:
    """Why a fragment looks like junk. Empty list = looks like prose worth keeping."""
    words = text.split()
    out: list[str] = []
    if len(words) < MIN_WORDS:
        out.append(f"short ({len(words)} words)")
    dig, numtok = _digit_ratio(text), _number_tokens(text)
    if dig >= 0.15 or numtok >= 0.45:
        out.append(f"data table (digits {dig:.0%}, numeric tokens {numtok:.0%})")
    s = len(_SEARCH.findall(text))
    # An abstract names its databases in one sentence and is the most useful chunk of a paper:
    # never a candidate on the search-strategy rule alone.
    is_abstract = text.lstrip().lower().startswith("abstract")
    if not is_abstract and (s >= 5 or len(re.findall(r"#\s?\d+\s*Search|Search strategy", text)) >= 2):
        out.append(f"search strategy ({s} markers)")
    r = len(_REF.findall(text))
    v = len(_VERB.findall(text))
    if r >= 14 or (r >= 8 and v <= 5):
        out.append(f"reference list ({r} citations, {v} verbs)")
    f = len(_FIG.findall(text))
    if f >= 4:
        out.append(f"figure/table captions ({f})")
    a = len(_ACK.findall(text))
    if a >= 3 or (a >= 1 and len(words) < 80):
        out.append(f"acknowledgements / back matter ({a})")
    n = len(_NAV.findall(text))
    if n >= 3:
        out.append(f"website navigation ({n})")
    return out


def lint(files: list[str]) -> list[dict]:
    cands = []
    for stem in files:
        path = KB_DIR / f"{stem}.json"
        if not path.exists():
            print(f"!! no such file: {path}", file=sys.stderr)
            continue
        data = json.load(open(path, encoding="utf-8"))
        for pos, c in enumerate(data):
            why = reasons_for(c.get("text") or "")
            if why:
                cands.append({"file": stem, "pos": pos, "chunk_idx": c.get("chunk_idx"),
                              "title": c.get("source_title") or stem, "reasons": why,
                              "head": (c.get("text") or "")[:120].replace("\n", " ")})
    return cands


def apply(files: list[str], drop: set[tuple[str, int]]) -> dict:
    """Remove the (file, pos) pairs; append them to the backup file. Returns counts per file."""
    removed_all = json.load(open(BACKUP, encoding="utf-8")) if BACKUP.exists() else []
    counts = {}
    for stem in files:
        path = KB_DIR / f"{stem}.json"
        data = json.load(open(path, encoding="utf-8"))
        keep, gone = [], []
        for pos, c in enumerate(data):
            if (stem, pos) in drop:
                gone.append(dict(c, _file=stem, _pos=pos, _reasons=reasons_for(c.get("text") or "")))
            else:
                keep.append(c)
        if gone:
            json.dump(keep, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            removed_all.extend(gone)
        counts[stem] = (len(data), len(keep))
    json.dump(removed_all, open(BACKUP, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return counts


def _pairs(items: list[str]) -> set[tuple[str, int]]:
    out = set()
    for it in items:
        stem, pos = it.rsplit(":", 1)
        out.add((stem, int(pos)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--files", nargs="*", default=DEFAULT_FILES, help="kb file stems to lint")
    ap.add_argument("--apply", action="store_true", help="remove the candidates (backup kept)")
    ap.add_argument("--keep", nargs="*", default=[], help="file:pos pairs to keep despite the lint")
    ap.add_argument("--drop", nargs="*", default=[], help="extra file:pos pairs to remove")
    a = ap.parse_args()

    cands = lint(a.files)
    keep, extra = _pairs(a.keep) | REVIEW_KEEP, _pairs(a.drop) | REVIEW_DROP
    print(f"{len(cands)} candidate(s) in {', '.join(a.files)}\n")
    cur = None
    by_pos = {(c["file"], c["pos"]) for c in cands}
    for stem, pos in sorted(extra - by_pos):
        d = json.load(open(KB_DIR / f"{stem}.json", encoding="utf-8"))[pos]
        cands.append({"file": stem, "pos": pos, "chunk_idx": d.get("chunk_idx"), "title": d.get("source_title") or stem,
                      "reasons": ["review: methods / caption text, no claim"],
                      "head": (d.get("text") or "")[:120].replace("\n", " ")})
    cands.sort(key=lambda c: (DEFAULT_FILES.index(c["file"]) if c["file"] in DEFAULT_FILES else 99, c["pos"]))
    for c in cands:
        if c["file"] != cur:
            cur = c["file"]
            print(f"== {cur}")
        mark = "KEEP " if (c["file"], c["pos"]) in keep else "drop "
        print(f"{mark}{c['file']}:{c['pos']:<3} ci={c['chunk_idx']!s:>3}  {c['title'][:50]}")
        print(f"      {'; '.join(c['reasons'])}")
        print(f"      «{c['head']}»")
    if not a.apply:
        print("\n(dry run — add --apply to remove, --keep file:pos to override)")
        return
    drop = {(c["file"], c["pos"]) for c in cands} - keep | extra
    counts = apply(a.files, drop)
    total = 0
    for stem, (before, after) in counts.items():
        print(f"{stem}: {before} → {after}")
        total += before - after
    print(f"removed {total}; backup → {BACKUP.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
