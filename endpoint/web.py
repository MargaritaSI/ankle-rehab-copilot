# -*- coding: utf-8 -*-
"""
Tavily fallback — used ONLY when the question is outside the local library
(or the library returns nothing). Restricted to medical / evidence domains so
the answer still cites checkable sources. Results are labelled as web sources.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parent.parent / ".env")

DOMAINS = [
    "pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "europepmc.org",
    "cochranelibrary.com", "nice.org.uk", "nhs.uk", "orthoinfo.aaos.org",
    "physio-pedia.com", "hss.edu", "mayoclinic.org",
]


# Spend guard for the web tier. The Tavily "Researcher" plan is 1,000 credits a month with no
# card on file and no pay-as-you-go, so the account itself cannot be charged — but a bot hammering
# the public demo could burn the month in an afternoon. One basic search = 1 credit; with
# "always add" as the default mode every question is one credit, so the cap keeps a day at
# ~4% of the month (40 × 30 = 1,200 ≈ the plan, and real traffic is far below the cap).
WEB_DAILY_CAP = int(os.environ.get("WEB_DAILY_CAP", "40"))
_USAGE_FILE = pathlib.Path(__file__).resolve().parent.parent / ".web_usage.json"


def _usage() -> dict:
    today = time.strftime("%Y-%m-%d")
    try:
        d = json.loads(_USAGE_FILE.read_text())
        if d.get("date") == today:
            return d
    except Exception:
        pass
    return {"date": today, "calls": 0}


def usage_today() -> dict:
    u = _usage()
    u["cap"] = WEB_DAILY_CAP
    return u


def _record() -> None:
    u = _usage()
    u["calls"] += 1
    try:
        _USAGE_FILE.write_text(json.dumps(u))
    except Exception:
        pass


def available() -> bool:
    return bool(os.environ.get("TAVILY_API_KEY"))


def search(query: str, max_results: int = 5) -> list[dict]:
    if not available():
        return []
    if WEB_DAILY_CAP and _usage()["calls"] >= WEB_DAILY_CAP:
        print(f"[web] daily cap of {WEB_DAILY_CAP} Tavily searches reached — skipping", file=sys.stderr)
        return []
    _record()
    last_err = None
    for attempt in range(2):                      # one retry on a transient failure
        try:
            r = requests.post(
                "https://api.tavily.com/search",
                headers={"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}"},
                json={"query": query[:400], "search_depth": "basic", "max_results": max_results,
                      "include_domains": DOMAINS, "include_answer": False},
                timeout=20,
            )
            r.raise_for_status()
            out = []
            for i, item in enumerate(r.json().get("results", []), 1):
                out.append({"id": f"WEB-{i}", "title": item.get("title", ""),
                            "url": item.get("url", ""), "text": item.get("content", "")})
            return out
        except Exception as exc:
            last_err = exc
    print(f"[web] Tavily search failed: {last_err}", file=sys.stderr)
    return []
