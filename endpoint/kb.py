# -*- coding: utf-8 -*-
"""
Curated tier: the author's own knowledge base (corpus/kb/*.json), compiled from
published sources while recovering from talus OAT (mosaicplasty). ~440 short
notes: rehab phases, donor knee, micro-movement routine, nutrition and
supplements, cartilage longevity, scenario predictions, FAQ.

It is NOT a clinical protocol — it is reviewed notes with source links, ranked
ABOVE the raw paper chunks because it is specific to this surgery.

The notes are mixed Russian / English, so this tier is embedded with a
MULTILINGUAL model served by Nebius Token Factory (Qwen3-Embedding-8B via the
OpenAI embeddings API) — the local MiniLM used for the English papers does not
cross languages. ~440 notes → one-off build cached under corpus/index_kb/.
"""
from __future__ import annotations

import json
import pathlib
import pickle

import os

import faiss
import numpy as np
from openai import OpenAI

EMBED_MODEL = os.environ.get("KB_EMBED_MODEL", "Qwen/Qwen3-Embedding-8B")

ROOT = pathlib.Path(__file__).resolve().parent.parent
KB_DIR = ROOT / "corpus" / "kb"
KB_INDEX = ROOT / "corpus" / "index_kb"

FACETS = {
    "talus_oat_rehab": "rehab", "ocd_talus_rehab": "rehab", "distilled": "rehab",
    "donor_knee": "donor knee", "micro_movement_routine": "routine",
    "nutrition_supplements": "nutrition", "extended_kb": "nutrition & exercise",
    "extended_kb2": "misc", "cartilage_longevity": "long-term",
    "scenarios_predictions": "scenarios", "faq_bestof": "faq",
}

_index = None
_store = None


def _notes() -> list[dict]:
    notes = []
    for f in sorted(KB_DIR.glob("*.json")):
        for i, c in enumerate(json.load(open(f, encoding="utf-8"))):
            text = (c.get("text") or "").strip()
            if len(text) < 40:
                continue
            notes.append({
                "text": text,
                "title": c.get("source_title") or f.stem,
                "url": c.get("source_url") or "",
                "topic": c.get("topic") or f.stem,
                "facet": FACETS.get(f.stem, f.stem),
                "file": f.stem,
            })
    return notes


def _fingerprint() -> str:
    sizes = "|".join(f"{f.name}:{f.stat().st_size}" for f in sorted(KB_DIR.glob("*.json")))
    return f"{EMBED_MODEL}|{sizes}"


def embed(texts: list[str]) -> np.ndarray:
    """Multilingual embeddings from Nebius Token Factory (batched, normalised)."""
    client = OpenAI(base_url=os.environ.get("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1"),
                    api_key=os.environ.get("NEBIUS_API_KEY", "missing"))
    vecs: list[list[float]] = []
    for i in range(0, len(texts), 32):
        batch = [t[:6000] for t in texts[i:i + 32]]
        resp = client.embeddings.create(model=EMBED_MODEL, input=batch)
        vecs.extend(d.embedding for d in sorted(resp.data, key=lambda d: d.index))
    arr = np.asarray(vecs, dtype="float32")
    arr /= np.linalg.norm(arr, axis=1, keepdims=True) + 1e-9
    return arr


def load(embedder=None) -> None:
    """Build or load the small curated index (embedder arg kept for API compatibility)."""
    global _index, _store
    if _index is not None:
        return
    fp = _fingerprint()
    pkl = KB_INDEX / "chunks.pkl"
    if pkl.exists():
        store = pickle.load(open(pkl, "rb"))
        if store.get("fingerprint") == fp:
            _store = store
            _index = faiss.read_index(str(KB_INDEX / "faiss.index"))
            return
    notes = _notes()
    vecs = embed([f"{n['title']}\n{n['text']}" for n in notes])
    index = faiss.IndexFlatIP(vecs.shape[1])
    index.add(vecs)
    KB_INDEX.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(KB_INDEX / "faiss.index"))
    _store = {"notes": notes, "fingerprint": fp}
    pickle.dump(_store, open(pkl, "wb"))
    _index = index


def count() -> int:
    return len(_store["notes"]) if _store else 0


def retrieve(embedder, queries: list[str], k: int = 4, facets: list[str] | None = None) -> list[dict]:
    """Top-k notes over several phrasings of the question (max score wins)."""
    load()
    best: dict[int, float] = {}
    qv = embed([q for q in queries if q])
    pool = max(k * 5, 20)
    scores, idx = _index.search(qv, pool)
    for row_s, row_i in zip(scores, idx):
        for s, i in zip(row_s, row_i):
            if i < 0:
                continue
            if facets and _store["notes"][i]["facet"] not in facets:
                continue
            best[int(i)] = max(best.get(int(i), -1.0), float(s))
    ranked = sorted(best.items(), key=lambda kv: -kv[1])[:k]
    out = []
    for n, (i, s) in enumerate(ranked, 1):
        note = dict(_store["notes"][i])
        note.update({"id": f"KB-{n}", "score": round(s, 3)})
        out.append(note)
    return out
