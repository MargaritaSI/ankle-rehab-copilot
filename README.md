# Rehab Copilot — recovery after ankle cartilage surgery

**Evidence Q&A + a daily micro-routine for people recovering from talus cartilage surgery
(osteochondral autograft / mosaicplasty), built on NVIDIA Nemotron via Nebius Token Factory.**

> After cartilage surgery you are sent home with a sheet of paper and a physio slot every few
> weeks. Everything in between — *is this swelling normal at month 5? can I squat? how much
> protein? what about the donor knee on stairs?* — you figure out alone, from forums or from a
> chatbot that confidently guesses. Rehab Copilot answers from **published protocols and
> research only**, cites every claim, says where protocols disagree, and anchors the answer to
> **your week after surgery**.

Live demo: **https://huggingface.co/spaces/MargaritaSI/rehab-copilot** · Video: *(YouTube link
in the Devpost submission)* · Track: **Best Apps and Agents**

> ⚠️ Educational summary of published protocols and research. Not medical advice, not a clinical
> protocol. Protocols differ between clinics — the user's own surgeon's protocol always wins.
> The app says so on every screen.

---

## What it does

| Tab | What happens | Model |
|---|---|---|
| **Ask** | Any question, any language. Scope check + query rewrite → two-tier retrieval → cited answer with sections *What is typical at this stage · What to do · Where protocols differ · When to check with your clinician* | Nemotron 3 Nano → Nemotron 3 Super (reasoning on) |
| **Today's routine** | A checklist of 6–8 ≤1-minute movements + one nutrition habit for *your* phase, from the curated notes only, with stop-signs | Nemotron 3 Super |
| **Compare** | Two approaches side by side (e.g. cold vs compression) as a cited table; *no data* where the library is silent | Nemotron 3 Super / Ultra ("Deep") |
| **Before your appointment** | 5–7 concrete questions for the surgeon or physio + what to note down beforehand | Nemotron 3 Nano |

**Your recovery** (sidebar): surgery type + date → week N and the typical phase (protection →
early motion → progressive weight-bearing → strength & control → impact preparation → return
to sport → long-term care). The phase is injected into every prompt so "can I squat?" is answered
for week 22, not in general.

**Honesty rules baked in**

- Two knowledge tiers, labelled in the UI: **curated notes** (438 reviewed notes compiled by the
  author from published sources while recovering from this exact surgery — ranked first, but
  explicitly *not* a clinical protocol) and **743 open-access papers** from Europe PMC / PubMed
  Central (50,610 chunks, local FAISS).
- Every factual sentence carries a source id (`[KB-3]`, `[PMC12368451]`, `[WEB-1]`); the
  evidence panel shows the excerpt and the link.
- When sources disagree the answer has a **"Where protocols differ"** section with the range and
  the more conservative option, instead of silently picking one.
- Out-of-scope questions (another body part, shoe brands) are refused in 0.5 s by the scope
  check — no confident guessing. In-scope questions the library cannot answer fall back to
  **Tavily** web search restricted to medical domains, clearly labelled as web sources.
- Tone rules: neutral-to-supportive, no alarm words, red flags stated once and calmly.

## How NVIDIA Nemotron and Nebius Token Factory are used

All generation is NVIDIA Nemotron served by **Nebius Token Factory** (OpenAI-compatible API,
`https://api.tokenfactory.nebius.com/v1`). Three tiers keep the app responsive and credits cheap:

| Tier | Model id on Token Factory | Used for |
|---|---|---|
| fast | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | scope check + query rewrite (JSON, ~1 s), appointment questions |
| strong | `nvidia/nemotron-3-super-120b-a12b` | the evidence answer (reasoning **on** — it is what makes the model cite every sentence), today's routine, comparisons |
| deep | `nvidia/Nemotron-3-Ultra-550b-a55b` | optional "Deep" mode for answers and comparisons |

Reasoning is toggled per call with `chat_template_kwargs: {"enable_thinking": …}` — off for the
fast JSON calls, on for the evidence answer.

The **curated tier is embedded with `Qwen/Qwen3-Embedding-8B` from Token Factory** (the notes are
mixed Russian/English; a multilingual embedding model was the difference between "no data" and
the exact note). The paper tier stays on a local `all-MiniLM-L6-v2` + FAISS (free, 50k chunks),
searched with the English query the Nano tier produced, plus a small lexical boost for rare
terms.

A typical *Ask* = 2 Token Factory calls (Nano ~1 s + Super 5–15 s with reasoning) + 1 embedding
call. The footer of every answer lists the exact models and latencies.

Other Nebius pieces: `job/index.py` + `job/job.yaml` is the corpus indexing job (runs locally or
as a Nebius Serverless Job); the Dockerfile builds that job image.

## Run it locally

```bash
git clone https://github.com/MargaritaSI/ankle-rehab-copilot && cd ankle-rehab-copilot
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # put your NEBIUS_API_KEY (and optional TAVILY_API_KEY) in it
streamlit run app/app.py
```

First start downloads the prebuilt paper index (2 × 78 MB) from the GitHub Release `index-v1`
into `corpus/index/`; the curated index ships in the repo. Nothing else is needed.

Command-line check without the UI:

```bash
python endpoint/rag.py "Can I squat at month 5 and how deep?"
```

### Rebuild the library yourself (optional)

```bash
python corpus/fetch.py --per-topic 15   # Europe PMC open-access full texts → corpus/raw/ (free, no key)
python job/index.py                     # chunk + embed + tag → corpus/index/   (or run as a Nebius Job)
```

Topics are in `corpus/topics.py` (OAT/mosaicplasty of the talus, donor knee, weight-bearing
protocols, edema, nutrition & supplements, hormones / dienogest / pregnancy & bone, iron,
long-term joint preservation). Curated notes live in `corpus/kb/*.json` and are re-embedded
automatically when they change.

### Evaluate

```bash
python eval/eval_answers.py   # 13 questions (9 from an earlier bot evaluation + out-of-scope probes) → eval/_reports/
```

## Repository layout

```
app/app.py          Streamlit UI (tabs, profile sidebar, evidence panel)
endpoint/rag.py     orchestration: analyze → retrieve (2 tiers) → answer / routine / compare / questions
endpoint/llm.py     Nemotron tiers on Token Factory, reasoning toggle, call log
endpoint/kb.py      curated tier: Token Factory multilingual embeddings + FAISS
endpoint/phase.py   surgery date → week → typical phase (context for prompts)
endpoint/web.py     Tavily fallback (medical domains only)
corpus/             fetch.py (Europe PMC), topics.py, kb/*.json, index_kb/ (shipped), index/ (downloaded)
job/                indexing job (local or Nebius Serverless Job) + semantic tagger
eval/               answer evaluation script and reports
```

## What changed during the hackathon submission period

A retrieval prototype (Europe PMC fetcher, FAISS index, a Russian-only Streamlit page on a
self-hosted Qwen endpoint) existed from June 2026 and was never published. During the
submission period it was rebuilt into this product:

- generation moved to **NVIDIA Nemotron 3 (Nano / Super / Ultra) on Nebius Token Factory**, with
  a tiered routing design and per-call reasoning control;
- a second, **curated knowledge tier** (438 notes) added above the papers, embedded with
  Token Factory's multilingual model;
- **recovery-phase context** (surgery date → week → phase) in every answer;
- new modes: **Today's routine**, **Compare**, **Before your appointment**;
- **scope check** (no guessing outside the library) and **Tavily** web fallback;
- "Where protocols differ" and tone rules; English UI; multilingual questions;
- public repository, prebuilt index as a release asset, hosted demo, evaluation script.

## License

MIT — see `LICENSE`. No personal or patient data anywhere in the repository; the library is
open-access literature only.
