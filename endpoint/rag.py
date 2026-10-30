# -*- coding: utf-8 -*-
"""
Orchestration: question → scope check + query rewrite (Nemotron Nano) →
two-tier retrieval (curated notes + 740 open-access papers, local FAISS) →
evidence answer (Nemotron Super) → structured result with citations.

Outside the library: Tavily web search (medical domains only) or an honest
"this library does not cover that" — never a confident guess.

Retrieval is local and free (MiniLM embeddings + FAISS). Generation runs on
NVIDIA Nemotron via Nebius Token Factory (see llm.py).
"""
from __future__ import annotations

import os
import pathlib
import pickle
import re

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

import kb
import llm
import web
from phase import Profile

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "corpus" / "index"
# Where to fetch the prebuilt paper index if it is not on disk (GitHub Release).
INDEX_BASE_URL = os.environ.get(
    "INDEX_BASE_URL",
    "https://github.com/MargaritaSI/ankle-rehab-copilot/releases/download/index-v1/",
)

DISCLAIMER = ("Educational summary of published protocols and research, not medical advice. "
              "Decisions about your treatment belong with you and your clinician.")

SCOPE = (
    "Recovery after ankle cartilage surgery — osteochondral autograft transfer / mosaicplasty "
    "of the talus (OAT, OATS), other talus cartilage repair (microfracture, ACI), the donor knee; "
    "rehabilitation phases, weight-bearing, swelling and edema, exercises and home routines, "
    "return to sport; nutrition, protein, supplements, caffeine, alcohol, weight management for "
    "bone and cartilage healing; how hormones (dienogest, progestins, estrogen), pregnancy, iron "
    "status and age affect bone and joint recovery; long-term joint preservation and "
    "post-traumatic ankle osteoarthritis; anesthesia for this surgery and its after-effects "
    "(general vs regional / nerve block, nausea, reflux, fatigue, sleep); scar care (silicone "
    "sheets, sun, massage); low-impact activity (swimming, stationary bike, elliptical, walking); "
    "compression, elevation, heat and swelling; the emotional side of surgery and recovery — "
    "fear, low mood, fear of movement, coping — and evidence-based self-help techniques."
)

SYSTEM = """You help a person recovering from ankle cartilage surgery understand what PUBLISHED
protocols and research say. You are calm, specific and honest.

You are given two kinds of fragments:
- CURATED NOTES [KB-n]: the author's reviewed notes compiled from published sources, specific to
  talus OAT / mosaicplasty. Treat them as the most relevant tier.
- PAPERS [PMCxxxxx]: chunks of open-access research articles.
- Sometimes WEB [WEB-n]: web results from medical domains, used only when the library is silent.

Rules
1. Use ONLY the fragments. Every concrete claim carries its source id in brackets.
2. Be concrete: weeks, grams, degrees, exercise names, muscles, minutes. No filler sentences
   ("it is important to monitor", "consult a specialist") unless tied to a detail from a source.
3. Protocols differ. Write "Where protocols differ" ONLY when two fragments actually disagree;
   every side of the disagreement carries its own source id, e.g. "6 months [KB-2] vs 9–12 months
   [PMC123]", then name the more conservative option. If the fragments do not disagree, write
   exactly one line there: "The sources here do not disagree on this — ask which protocol your
   surgeon follows." NEVER invent ranges, weeks or minutes to fill this section.
4. If the person's recovery phase is given, anchor the answer to it ("at week 22 …"). If not,
   give the answer by phase.
5. Tone: neutral to supportive. No alarm words, no catastrophizing, no promises of outcomes.
   When sources say a symptom is common at this stage, say that plainly — it lowers fear.
   Red flags are stated once, calmly, as "worth a check with your clinician if …".
6. No diagnosis of the person. Describe mechanisms the sources describe.
7. If the fragments do not answer the question, say "The library has no data on this" and stop.
7b. Emotional topics (fear, low mood, worry before or after surgery): everyday support, not
   therapy. Offer only techniques the fragments describe (paced breathing, CBT-style reframing,
   graded exposure to movement, mindfulness, sleep habits) with the concrete steps; EMDR and
   similar are clinician-delivered — present them as something to ask a therapist about. If the
   person describes being unable to cope or thoughts of self-harm, say plainly and warmly that
   this deserves a professional today and name the local emergency / crisis route.
7c. Anesthesia questions: describe what sources report (side-effect rates, regional vs general
   outcomes) as information for the conversation with the anesthesiologist — the choice is
   theirs and the patient's together.
8. Answer in the language of the question (Russian question → Russian answer), keep source ids
   as they are. Use bold section headings, TRANSLATED into the answer language:
   **What is typical at this stage** · **What to do** · **Where protocols differ** ·
   **When to check with your clinician**  (omit a section if there is nothing for it).
9. End with exactly this one line (translated to the answer language):
   "Educational summary of published protocols and research, not medical advice."
"""

_model = None
_index = None
_store = None


# ----------------------------------------------------------------- loading
class IndexUnavailable(RuntimeError):
    """The prebuilt paper index is not on disk and could not be downloaded."""


def _ensure_index_files() -> None:
    """Download the prebuilt paper index from the GitHub Release on first run."""
    import requests
    INDEX.mkdir(parents=True, exist_ok=True)
    for name in ("faiss.index", "chunks.pkl"):
        p = INDEX / name
        if p.exists() and p.stat().st_size > 1_000_000:
            continue
        url = INDEX_BASE_URL.rstrip("/") + "/" + name
        tmp = p.with_suffix(p.suffix + ".part")
        try:
            with requests.get(url, stream=True, timeout=120, allow_redirects=True,
                              headers={"User-Agent": "rehab-copilot/1.0"}) as r:
                r.raise_for_status()
                with open(tmp, "wb") as fh:
                    for block in r.iter_content(chunk_size=1 << 20):
                        fh.write(block)
        except Exception as exc:
            tmp.unlink(missing_ok=True)
            raise IndexUnavailable(f"Could not download {name} from {url}: {exc}") from exc
        tmp.replace(p)


def _load() -> None:
    global _model, _index, _store
    if _index is None:
        _ensure_index_files()
        _store = pickle.load(open(INDEX / "chunks.pkl", "rb"))
        _model = SentenceTransformer(_store["model"])
        _index = faiss.read_index(str(INDEX / "faiss.index"))
        kb.load(_model)


def stats() -> dict:
    _load()
    papers = {m.get("pmcid") for m in _store["metas"]}
    return {"papers": len(papers), "paper_chunks": len(_store["chunks"]), "notes": kb.count()}


def all_tags() -> list[str]:
    _load()
    seen: set[str] = set()
    for ts in _store.get("tags", []):
        seen.update(ts)
    return sorted(seen)


# --------------------------------------------------------------- retrieval
_STOP = {"after", "about", "which", "their", "there", "these", "those", "should", "would",
         "could", "during", "between", "effect", "effects", "patients", "surgery", "recovery",
         "study", "studies", "ankle", "talus", "cartilage", "osteochondral", "autograft",
         "transfer", "transplantation", "mosaicplasty", "rehabilitation", "healing"}


def _keywords(q: str) -> set[str]:
    return {w for w in re.findall(r"[a-zA-Z]{5,}", q.lower()) if w not in _STOP}


def retrieve(question: str, k: int = 6, tags: list[str] | None = None) -> list[dict]:
    """Top-k paper chunks: dense search over a wider pool, then a small lexical boost
    for chunks that literally contain the query's rarer words (so 'caffeine' beats a
    generic nutrition chunk), optionally restricted to semantic tags."""
    _load()
    qv = np.asarray(_model.encode([question], normalize_embeddings=True), dtype="float32")
    pool = max(k * 8, 48)
    scores, idx = _index.search(qv, pool)
    store_tags = _store.get("tags", [])
    kws = _keywords(question)
    cands = []
    for rank, i in enumerate(idx[0]):
        if i < 0:
            continue
        ctags = store_tags[i] if i < len(store_tags) else []
        if tags and not (set(tags) & set(ctags)):
            continue
        text = _store["chunks"][i]
        low = text.lower()
        boost = min(0.12, 0.04 * sum(1 for w in kws if w in low))
        cands.append({"text": text, "meta": _store["metas"][i], "tags": ctags,
                      "score": float(scores[0][rank]) + boost})
    cands.sort(key=lambda h: -h["score"])
    return cands[:k]


def retrieve_multi(queries: list[str], k: int = 6, tags: list[str] | None = None) -> list[dict]:
    """Interleave the result lists of several queries (so a mechanism query is not
    crowded out by surgery-specific hits), deduplicated by chunk text."""
    lists = [retrieve(q, k, tags) for q in queries if q]
    out, seen = [], set()
    for rank in range(k):
        for lst in lists:
            if rank < len(lst):
                key = lst[rank]["text"][:200]
                if key not in seen:
                    seen.add(key)
                    out.append(lst[rank])
    return out[:k]


def _says_no_data(text: str) -> bool:
    """True when the answer admits a gap — fully or for one of its sections."""
    t = text.lower()
    return any(m in t for m in ("no data on this", "has no data", "нет данных", "не содержит данных",
                                "geen gegevens", "keine daten", "no hay datos"))


_CITE = re.compile(r"\[(?:KB-\d+|PMC\d+|WEB-\d+)\]")
_NUMBER = re.compile(r"\d")
NO_SOURCE_TAG = " _(no source in the library — check with your clinician)_"


def _flag_unsourced(text: str) -> str:
    """Citation guard: a bullet or sentence line that states a number (weeks, minutes, grams,
    degrees) but carries no source id gets a visible tag instead of passing as evidence."""
    out = []
    for line in text.splitlines():
        body = line.strip()
        is_claim = (body.startswith(("-", "*", "•")) or len(body) > 60) and not body.startswith("**")
        if (is_claim and _NUMBER.search(body) and not _CITE.search(body)
                and "not medical advice" not in body.lower() and "медицинск" not in body.lower()):
            line = line.rstrip() + NO_SOURCE_TAG
        out.append(line)
    return "\n".join(out)


def _tidy(text: str) -> str:
    """Normalise citation brackets (【PMC1】 → [PMC1]) and flag unsourced numeric claims."""
    return _flag_unsourced(text.replace("【", "[").replace("】", "]"))


def _excerpt(text: str, words: int = 45) -> str:
    body = text.split("\n\n", 1)[-1]
    return " ".join(body.split()[:words]) + " …"


def _paper_evidence(hits: list[dict]) -> list[dict]:
    evidence, seen = [], set()
    for h in hits:
        p = h["meta"].get("pmcid", "?")
        if p in seen:
            continue
        seen.add(p)
        evidence.append({"id": p, "title": h["meta"].get("title", ""),
                         "year": h["meta"].get("year", ""), "tags": h["tags"],
                         "excerpt": _excerpt(h["text"]),
                         "url": f"https://pmc.ncbi.nlm.nih.gov/articles/{p}/"})
    return evidence


def _kb_evidence(notes: list[dict]) -> list[dict]:
    return [{"id": n["id"], "title": n["title"], "facet": n["facet"], "url": n["url"],
             "excerpt": " ".join(n["text"].split()[:45]) + " …", "score": n["score"]}
            for n in notes]


# ---------------------------------------------------------------- analysis
def analyze(question: str) -> dict:
    """Nemotron Nano: is the question inside the library's scope? + English search query."""
    data = llm.chat_json([
        {"role": "system", "content":
         "You route questions for a recovery-after-ankle-cartilage-surgery library.\n"
         f"LIBRARY SCOPE: {SCOPE}\n"
         "Return JSON only: {\"in_scope\": true|false, \"reason\": \"<10 words>\", "
         "\"query_en\": \"<the question rewritten in English as a dense search query with "
         "medical terms, keeping the surgery context>\", "
         "\"query_general\": \"<a second English query about the underlying mechanism or "
         "topic WITHOUT the surgery name, e.g. 'dependent edema prolonged standing lower limb "
         "compression elevation'>\", "
         "\"lang\": \"<English name of the question language, e.g. Russian>\"}.\n"
         "The person asking had ankle cartilage surgery (talus OAT / mosaicplasty, donor knee). "
         "Everyday questions asked for THIS recovery are in scope: which exercises, sport, stairs, "
         "core/abs training, driving, work, travel, sleep, weight loss, what to eat or drink, "
         "supplements, caffeine, alcohol, hormones — anything where the real question is 'what is "
         "safe or useful for my leg'. in_scope is false only for a different body region or "
         "condition on its own (spine, shoulder, hand, hernia), product/brand shopping, or topics "
         "with no link to recovery, nutrition, hormones or joints."},
        {"role": "user", "content": question},
    ], tier="fast", purpose="scope + query rewrite")
    return {"in_scope": bool(data.get("in_scope", True)),
            "reason": data.get("reason", ""),
            "query_en": data.get("query_en") or question,
            "query_general": data.get("query_general") or "",
            "lang": data.get("lang") or "the language of the question"}


def _context(notes: list[dict], hits: list[dict], webhits: list[dict]) -> str:
    parts = []
    if notes:
        parts.append("CURATED NOTES:\n" + "\n\n".join(
            f"[{n['id']}] {n['title']}\n{n['text']}" for n in notes))
    if hits:
        parts.append("PAPERS:\n" + "\n\n".join(
            f"[{h['meta'].get('pmcid', '?')}] {h['meta'].get('title', '')}\n{h['text']}"
            for h in hits))
    if webhits:
        parts.append("WEB (not from the curated library):\n" + "\n\n".join(
            f"[{w['id']}] {w['title']} — {w['url']}\n{w['text']}" for w in webhits))
    return "\n\n".join(parts)


# ------------------------------------------------------------------ modes
def answer(question: str, profile: Profile | None = None, *, tags: list[str] | None = None,
           tier: str = "strong", allow_web: bool = True, k_papers: int = 6, k_notes: int = 4) -> dict:
    """Main Q&A. Returns answer + evidence (notes / papers / web) + routing info."""
    llm.reset_calls()
    _load()
    profile = profile or Profile()
    a = analyze(question)
    p = profile.phase
    phase_hint = f" at week {profile.weeks} ({p['name']} phase)" if p else ""
    kb_queries = [question, a["query_en"], a["query_en"] + phase_hint]
    if a["query_general"]:
        kb_queries.append(a["query_general"])

    notes, hits, webhits, source = [], [], [], "library"
    if a["in_scope"]:
        notes = kb.retrieve(_model, kb_queries, k=k_notes)
        hits = retrieve_multi([a["query_en"], a["query_general"]], k_papers, tags)
    if not notes and not hits:
        if allow_web and web.available():
            webhits = web.search(a["query_en"])
            source = "web"
        if not webhits:
            msg = ("This library covers recovery after ankle cartilage surgery, nutrition for bone "
                   "and cartilage, and how hormones affect joints. Your question looks outside that "
                   f"({a['reason'] or 'different topic'}), so I will not guess.")
            return {"answer": msg, "evidence": {"notes": [], "papers": [], "web": []},
                    "routing": a, "source": "none", "calls": list(llm.CALLS),
                    "disclaimer": DISCLAIMER}

    user = (f"PERSON'S CONTEXT: {profile.context()}\n"
            f"ANSWER LANGUAGE: {a['lang']} (translate the final disclaimer line too).\n\n"
            f"FRAGMENTS:\n{_context(notes, hits, webhits)}\n\nQUESTION: {question}\n\n"
            f"REMINDER: every factual sentence ends with its source id in brackets, e.g. [KB-2] or "
            f"[PMC12345678]; a sentence you cannot source must be dropped. Bold section headings. "
            f"Answer language: {a['lang']}.")
    text = llm.chat([{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": user}],
                    tier=tier, think=True, max_tokens=1200, purpose="evidence answer")
    if _says_no_data(text) and allow_web and web.available() and not webhits:
        webhits = web.search(a["query_en"])
        if webhits:
            source = "web" if not (notes or hits) else "library+web"
            user = (f"PERSON'S CONTEXT: {profile.context()}\n"
                    f"ANSWER LANGUAGE: {a['lang']}.\n\n"
                    f"FRAGMENTS:\n{_context(notes, hits, webhits)}\n\nQUESTION: {question}\n\n"
                    f"REMINDER: the curated library could not answer all of this, so WEB fragments "
                    f"from medical domains were added. Use library fragments first; where only web "
                    f"fragments answer, cite [WEB-n] and mark that part as 'from web sources outside "
                    f"the curated library'. Cite after every factual sentence. Answer language: {a['lang']}.")
            text = llm.chat([{"role": "system", "content": SYSTEM},
                             {"role": "user", "content": user}],
                            tier=tier, think=False, max_tokens=1000, purpose="web-grounded answer")
    return {"answer": _tidy(text),
            "evidence": {"notes": _kb_evidence(notes), "papers": _paper_evidence(hits), "web": webhits},
            "routing": a, "source": source, "calls": list(llm.CALLS), "disclaimer": DISCLAIMER}


ROUTINE_SYSTEM = """You compose TODAY's home micro-routine for a person recovering from ankle
cartilage surgery, from the fragments only (curated notes on the micro-movement system and the
rehab phase, plus papers). Principle from the notes: frequency beats intensity — many tiny sets
through the day, each ≤ 1 minute, explained in one sentence.

Output (in the language requested):
**Today — week N, phase X** one line on what this phase is for.
Then 6–8 checklist items as markdown task list lines "- [ ] …": each = one movement or habit
(≤ 1 min or a nutrition/hydration habit), when in the day to do it, target muscles or purpose,
and a source id in brackets. Mix: 2 lying/sitting, 2 standing/walking, 1 donor-knee item,
1 nutrition item (protein / hydration / caffeine timing if present in fragments), 1 breathing or
swelling-control item.
Then **Stop signs** — 2 calm lines from the fragments (pain that persists past rest, swelling
next morning) with what to do (reduce, not quit).
Then **Where protocols differ** if the fragments disagree about this phase.
Only what the fragments support. No new exercises. End with one short disclaimer line.
"""


def routine(profile: Profile, lang: str = "English", constraints: str = "") -> dict:
    """Today's micro-routine for the person's phase (Nemotron Super, curated tier first)."""
    llm.reset_calls()
    _load()
    p = profile.phase
    phase_q = (f"home exercises and loading rules at week {profile.weeks} after talus OAT, "
               f"phase {p['name']}: {p['focus']}") if p else \
              "home micro-movement routine after talus OAT by phase"
    notes = kb.retrieve(_model, [phase_q, "micro movement routine lying sitting standing walking"
                                 " one minute sets", "donor knee protection exercises",
                                 "protein hydration caffeine timing bone cartilage healing"], k=10)
    hits = retrieve(phase_q, 4)
    user = (f"PERSON'S CONTEXT: {profile.context()}\n"
            f"CONSTRAINTS FROM THE PERSON: {constraints or 'none'}\n"
            f"ANSWER LANGUAGE: {lang}\n\nFRAGMENTS:\n{_context(notes, hits, [])}")
    text = llm.chat([{"role": "system", "content": ROUTINE_SYSTEM},
                     {"role": "user", "content": user}],
                    tier="strong", max_tokens=1000, purpose="today's routine")
    return {"answer": _tidy(text),
            "evidence": {"notes": _kb_evidence(notes), "papers": _paper_evidence(hits), "web": []},
            "calls": list(llm.CALLS), "disclaimer": DISCLAIMER}


def compare(topic_a: str, topic_b: str, k: int = 5, tier: str = "strong") -> dict:
    """Compare what the library says about two approaches (table, cited)."""
    llm.reset_calls()
    _load()
    aa, ab = analyze(topic_a), analyze(topic_b)
    qa, qb = aa["query_en"], ab["query_en"]
    ha, hb = retrieve(qa, k), retrieve(qb, k)
    na, nb = kb.retrieve(_model, [topic_a, qa], k=2), kb.retrieve(_model, [topic_b, qb], k=2)
    ctx_a = _context(na, ha, [])
    ctx_b = _context(nb, hb, [])
    text = llm.chat([
        {"role": "system", "content":
         "Compare what the fragments say about two approaches. Give a markdown table "
         "(rows: mechanism, evidence strength, typical protocol / dose / timing, when it is "
         "preferred, cautions), every cell with source ids in brackets, then 3 lines of "
         "'Where they differ' and a calm one-line takeaway. Only from the fragments; write "
         "'no data' where the fragments are silent. Answer in the language of the topics. "
         "End with one short disclaimer line."},
        {"role": "user", "content": f"ANSWER LANGUAGE: {aa['lang']}\n\nAPPROACH A: {topic_a}\n{ctx_a}"
                                    f"\n\nAPPROACH B: {topic_b}\n{ctx_b}"},
    ], tier=tier, think=(tier == "deep"), max_tokens=1100, purpose="comparison")
    return {"answer": _tidy(text),
            "evidence": {"notes": _kb_evidence(na + nb), "papers": _paper_evidence(ha + hb), "web": []},
            "calls": list(llm.CALLS), "disclaimer": DISCLAIMER}


def specialist_questions(topic: str, profile: Profile | None = None, k: int = 5) -> dict:
    """Questions worth asking the surgeon / physio about a topic (Nemotron Nano)."""
    llm.reset_calls()
    _load()
    profile = profile or Profile()
    a = analyze(topic)
    q = a["query_en"]
    hits = retrieve_multi([q, a["query_general"]], k)
    notes = kb.retrieve(_model, [topic, q], k=3)
    text = llm.chat([
        {"role": "system", "content":
         "From the fragments, write 5–7 concrete questions the person should ask their surgeon "
         "or physiotherapist about this topic, grouped under 2–3 bold headings. Each question "
         "should be answerable in a 10-minute appointment and reference the detail from a source "
         "in brackets. Add one line 'Bring with you:' listing what to note down beforehand "
         "(dates, measurements, photos of swelling). No advice of your own — questions only. "
         "Answer in the language of the topic."},
        {"role": "user", "content": f"PERSON'S CONTEXT: {profile.context()}\n"
                                    f"ANSWER LANGUAGE: {a['lang']}\nTOPIC: {topic}\n"
                                    f"FRAGMENTS:\n{_context(notes, hits, [])}"},
    ], tier="fast", max_tokens=700, purpose="questions for the appointment")
    return {"answer": _tidy(text),
            "evidence": {"notes": _kb_evidence(notes), "papers": _paper_evidence(hits), "web": []},
            "calls": list(llm.CALLS), "disclaimer": DISCLAIMER}


if __name__ == "__main__":
    import datetime as dt
    import sys
    q = " ".join(sys.argv[1:]) or "weight-bearing protocol after OAT of the talus"
    res = answer(q, Profile(surgery_date=dt.date.today() - dt.timedelta(weeks=22)))
    print(res["answer"])
    print("\nROUTING:", res["routing"], "| source:", res["source"])
    for n in res["evidence"]["notes"]:
        print(f"  [{n['id']}] {n['title'][:70]} ({n['facet']}, {n['score']})")
    for e in res["evidence"]["papers"]:
        print(f"  [{e['id']}] {e['title'][:70]} {e['tags']}")
    print("CALLS:", [(c["label"], c["purpose"], c["seconds"]) for c in res["calls"]])
