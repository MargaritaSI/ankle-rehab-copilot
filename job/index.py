# -*- coding: utf-8 -*-
"""
ШАГ 2 — ИНДЕКСАЦИЯ (Nebius Serverless AI JOB).

Это «Job» из челленджа: запускается один раз, отрабатывает, освобождает compute.
Читает чистый текст из corpus/raw/, режет на чанки, считает эмбеддинги,
строит векторную базу FAISS -> corpus/index/.

Эмбеддинги считаются ЛОКАЛЬНОЙ моделью (sentence-transformers) = БЕСПЛАТНО.
Job всё равно засчитывается как использование Nebius Serverless (он крутится
на их инфраструктуре). Так экономим кредиты для LLM-endpoint.

Запуск локально (для отладки):
    python job/index.py
Запуск как Nebius Job: см. job/job.yaml
"""
import pathlib
import pickle
import re

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

from tags import TAGS, TAG_THRESHOLD

ROOT = pathlib.Path(__file__).parent.parent
RAW = ROOT / "corpus" / "raw"
INDEX = ROOT / "corpus" / "index"
EMB_MODEL = "sentence-transformers/all-MiniLM-L6-v2"  # маленькая, быстрая, бесплатная

CHUNK_WORDS = 220
CHUNK_OVERLAP = 40


def chunk(text: str):
    words = text.split()
    step = CHUNK_WORDS - CHUNK_OVERLAP
    for i in range(0, len(words), step):
        piece = " ".join(words[i:i + CHUNK_WORDS])
        if len(piece) > 200:
            yield piece


def parse_header(text: str) -> dict:
    meta = {}
    for line in text.split("\n")[:6]:
        m = re.match(r"(PMCID|TITLE|YEAR|JOURNAL|TOPIC):\s*(.*)", line)
        if m:
            meta[m.group(1).lower()] = m.group(2)
    return meta


def main():
    INDEX.mkdir(parents=True, exist_ok=True)
    files = sorted(RAW.glob("*.txt"))
    print(f"Файлов: {len(files)}")

    model = SentenceTransformer(EMB_MODEL)
    chunks, metas = [], []

    for f in files:
        text = f.read_text(encoding="utf-8")
        meta = parse_header(text)
        for piece in chunk(text):
            chunks.append(piece)
            metas.append(meta)

    print(f"Чанков: {len(chunks)}. Считаю эмбеддинги...")
    vecs = model.encode(chunks, batch_size=64, show_progress_bar=True,
                        normalize_embeddings=True)
    vecs = np.asarray(vecs, dtype="float32")

    # --- СЕМАНТИЧЕСКАЯ РАЗМЕТКА ТЕГОВ (Job делает больше, чем эмбеддинги) ---
    print("Классифицирую чанки по тегам...")
    tag_names = list(TAGS.keys())
    tag_vecs = model.encode([TAGS[t] for t in tag_names], normalize_embeddings=True)
    tag_vecs = np.asarray(tag_vecs, dtype="float32")
    sims = vecs @ tag_vecs.T                      # (n_chunks, n_tags) косинус
    chunk_tags = []
    for row in sims:
        tags = [tag_names[i] for i, s in enumerate(row) if s >= TAG_THRESHOLD]
        if not tags:                              # гарантируем хотя бы один
            tags = [tag_names[int(row.argmax())]]
        chunk_tags.append(tags)

    # статистика покрытия (полезно для блога/README)
    from collections import Counter
    cnt = Counter(t for ts in chunk_tags for t in ts)
    print("Теги:", dict(cnt))

    index = faiss.IndexFlatIP(vecs.shape[1])  # косинус (вектора нормированы)
    index.add(vecs)

    faiss.write_index(index, str(INDEX / "faiss.index"))
    with open(INDEX / "chunks.pkl", "wb") as fh:
        pickle.dump({"chunks": chunks, "metas": metas, "tags": chunk_tags,
                     "model": EMB_MODEL}, fh)

    print(f"ГОТОВО. Индекс: {INDEX}")


if __name__ == "__main__":
    main()
