# -*- coding: utf-8 -*-
"""
ШАГ 1 — СБОР КОРПУСА. Запускается ЛОКАЛЬНО на твоём ноуте. СТОИТ $0.

Берёт публичные статьи Open Access из Europe PMC (зеркало PubMed Central)
по запросам из topics.py и сохраняет ЧИСТЫЙ ТЕКСТ в corpus/raw/.
Никакого парсинга PDF — Europe PMC отдаёт полнотекст в XML, мы снимаем теги.

Запуск:
    pip install -r requirements.txt
    python corpus/fetch.py --per-topic 15

Europe PMC REST API — бесплатный, без ключа, без регистрации.
Docs: https://europepmc.org/RestfulWebService
"""
from __future__ import annotations

import argparse
import re
import time
import pathlib
import requests

from topics import TOPICS

RAW = pathlib.Path(__file__).parent / "raw"
SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
FULLTEXT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"


def _get(url, params=None, tries=4):
    """GET с повторами и backoff — Europe PMC иногда отдаёт 503."""
    for attempt in range(tries):
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 503:
                raise requests.HTTPError("503")
            r.raise_for_status()
            return r
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))  # 2s, 4s, 6s


def search_open_access(query: str, limit: int):
    """Найти Open-Access статьи с полным текстом по запросу."""
    params = {
        "query": f'({query}) AND OPEN_ACCESS:Y AND IN_EPMC:Y AND HAS_FT:Y',
        "format": "json",
        "pageSize": limit,
        "resultType": "core",
    }
    r = _get(SEARCH, params=params)
    return r.json().get("resultList", {}).get("result", [])


def fetch_fulltext(pmcid: str) -> str | None:
    """Скачать полнотекст XML и снять теги -> чистый текст."""
    url = FULLTEXT.format(pmcid=pmcid)
    try:
        r = _get(url)
    except Exception:
        return None
    xml = r.text
    # грубое, но рабочее снятие XML-тегов
    text = re.sub(r"<[^>]+>", " ", xml)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) > 500 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-topic", type=int, default=15,
                    help="сколько статей на одну тему")
    args = ap.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    seen = set()
    saved = 0

    for key, query in TOPICS.items():
        print(f"\n=== {key}: {query}")
        try:
            results = search_open_access(query, args.per_topic)
        except Exception as e:
            print(f"  ! поиск не удался: {e}")
            continue

        for item in results:
            pmcid = item.get("pmcid")
            if not pmcid or pmcid in seen:
                continue
            seen.add(pmcid)
            if (RAW / f"{pmcid}.txt").exists():
                continue  # уже скачано — пропускаем (до-сбор не качает заново)
            text = fetch_fulltext(pmcid)
            if not text:
                continue
            # метаданные в шапку — пригодятся для цитат
            title = item.get("title", "").strip()
            year = item.get("pubYear", "")
            journal = item.get("journalTitle", "")
            header = f"PMCID: {pmcid}\nTITLE: {title}\nYEAR: {year}\nJOURNAL: {journal}\nTOPIC: {key}\n\n"
            (RAW / f"{pmcid}.txt").write_text(header + text, encoding="utf-8")
            saved += 1
            print(f"  + {pmcid}  {title[:70]}")
            time.sleep(0.34)  # вежливость к API

    print(f"\nГОТОВО. Сохранено статей: {saved} в {RAW}")


if __name__ == "__main__":
    main()
