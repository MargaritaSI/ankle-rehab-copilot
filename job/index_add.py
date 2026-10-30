# -*- coding: utf-8 -*-
"""
Incremental indexing: embed only papers in corpus/raw/ that are not yet in corpus/index/
and append them to the existing FAISS index + chunk store (same chunking, model and tags
as job/index.py). A full rebuild of 100k+ chunks takes ~40 min on CPU; this takes minutes.

    python job/index_add.py
"""
import pathlib
import pickle
import sys

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from index import INDEX, RAW, chunk, parse_header  # noqa: E402
from tags import TAGS, TAG_THRESHOLD  # noqa: E402

store = pickle.load(open(INDEX / "chunks.pkl", "rb"))
index = faiss.read_index(str(INDEX / "faiss.index"))
known = {m.get("pmcid") for m in store["metas"]}
new_files = [f for f in sorted(RAW.glob("*.txt")) if f.stem not in known]
print(f"indexed papers: {len(known)} · new files: {len(new_files)}")
if not new_files:
    sys.exit(0)

chunks, metas = [], []
for f in new_files:
    text = f.read_text(encoding="utf-8")
    meta = parse_header(text)
    for piece in chunk(text):
        chunks.append(piece)
        metas.append(meta)

model = SentenceTransformer(store["model"])
vecs = np.asarray(model.encode(chunks, batch_size=64, show_progress_bar=False,
                               normalize_embeddings=True), dtype="float32")
names = list(TAGS)
tag_vecs = np.asarray(model.encode([TAGS[t] for t in names], normalize_embeddings=True), dtype="float32")
chunk_tags = []
for row in vecs @ tag_vecs.T:
    tg = [names[i] for i, s in enumerate(row) if s >= TAG_THRESHOLD] or [names[int(row.argmax())]]
    chunk_tags.append(tg)

index.add(vecs)
store["chunks"] += chunks
store["metas"] += metas
store["tags"] += chunk_tags
faiss.write_index(index, str(INDEX / "faiss.index"))
pickle.dump(store, open(INDEX / "chunks.pkl", "wb"))
print(f"added {len(new_files)} papers / {len(chunks)} chunks → total {index.ntotal} chunks")
