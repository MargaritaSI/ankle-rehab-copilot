# -*- coding: utf-8 -*-
"""Fetch publication types for every paper in the index from Europe PMC (no key needed)
and write endpoint/paper_types.json {pmcid: "review" | "guideline" | "abstract" | "study"}.
The UI shows the type next to each paper so a reader sees how much weight it carries.
Run after rebuilding the paper index:  .venv/bin/python tool/fetch_paper_types.py release_v2/chunks.pkl
"""
import json, pickle, sys, time, urllib.parse, urllib.request, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "endpoint" / "paper_types.json"
API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

def classify(pub_types: list[str], title: str) -> str:
    pt = " | ".join(pub_types).lower(); t = (title or "").lower()
    if any(k in pt for k in ("guideline", "consensus")):
        return "guideline"
    if any(k in pt for k in ("meta-analysis", "systematic review", "review")):
        return "review"
    if any(k in pt for k in ("congress", "abstract", "proceedings")) or any(
            k in t for k in ("abstracts from", "proceedings of", "annual meeting", "scientific abstracts")):
        return "abstract"
    return "study"

def main(pkl: str):
    store = pickle.load(open(pkl, "rb"))
    titles = {}
    for m in store["metas"]:
        titles.setdefault(m["pmcid"], m.get("title", ""))
    ids = sorted(titles)
    out = {}
    for i in range(0, len(ids), 100):
        batch = ids[i:i + 100]
        q = "PMCID:(" + " OR ".join(batch) + ")"
        url = API + "?" + urllib.parse.urlencode({"query": q, "format": "json", "resultType": "core", "pageSize": 100})
        for attempt in range(3):
            try:
                data = json.load(urllib.request.urlopen(url, timeout=60)); break
            except Exception as e:
                print("retry", i, e); time.sleep(3)
        else:
            continue
        for r in data.get("resultList", {}).get("result", []):
            pid = r.get("pmcid")
            if pid:
                out[pid] = classify(r.get("pubTypeList", {}).get("pubType", []), titles.get(pid, ""))
        print(f"{min(i+100, len(ids))}/{len(ids)} → {len(out)}")
        time.sleep(0.3)
    OUT.write_text(json.dumps(out, indent=0, sort_keys=True), encoding="utf-8")
    from collections import Counter
    print("written", OUT, Counter(out.values()), "missing", len(ids) - len(out))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "release_v2" / "chunks.pkl"))
