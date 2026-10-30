# -*- coding: utf-8 -*-
"""
Tavily fallback — used ONLY when the question is outside the local library
(or the library returns nothing). Restricted to medical / evidence domains so
the answer still cites checkable sources. Results are labelled as web sources.
"""
from __future__ import annotations

import os

import requests

DOMAINS = [
    "pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "europepmc.org",
    "cochranelibrary.com", "nice.org.uk", "nhs.uk", "orthoinfo.aaos.org",
    "physio-pedia.com", "hss.edu", "mayoclinic.org",
]


def available() -> bool:
    return bool(os.environ.get("TAVILY_API_KEY"))


def search(query: str, max_results: int = 5) -> list[dict]:
    if not available():
        return []
    try:
        r = requests.post(
            "https://api.tavily.com/search",
            headers={"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}"},
            json={"query": query, "search_depth": "basic", "max_results": max_results,
                  "include_domains": DOMAINS, "include_answer": False},
            timeout=20,
        )
        r.raise_for_status()
        out = []
        for i, item in enumerate(r.json().get("results", []), 1):
            out.append({"id": f"WEB-{i}", "title": item.get("title", ""),
                        "url": item.get("url", ""), "text": item.get("content", "")})
        return out
    except Exception:
        return []
