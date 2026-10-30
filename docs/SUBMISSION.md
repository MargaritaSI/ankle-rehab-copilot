# Devpost submission texts

## Project name (≤ 60 chars)
Rehab Copilot — what nobody explained after ankle surgery

(alternative: `Rehab Copilot: cited answers after ankle cartilage surgery`)

## Elevator pitch (≤ 200 chars)
What nobody explained after ankle cartilage surgery: what's normal at your week, what to do, where protocols disagree, food, daily routine, questions for your physio. Every claim cited. By a patient.

## Track
Best Apps and Agents

---

## About the project (Markdown — paste as one block)

## Inspiration

I have been in this for four years. A first operation on my ankle did not work. Five months ago I had a second, harder one — an osteochondral autograft (mosaicplasty): cartilage taken from my knee and set into the talus. The surgery itself is well described. The months after it are not, and for a revision case there is almost nothing written for the patient at all.

What you actually get is a sheet of paper and a physio slot every few weeks, sometimes none, depending on where you live and what insurance covers. Between slots every question is yours alone: *is this swelling normal at month 5? can I squat? how much protein? why does the leg swell in the heat? how do I protect the donor knee on stairs?* Forums guess. General chatbots guess confidently — one of the papers in my library is literally titled *"ChatGPT-4 responses on ankle cartilage surgery often diverge from expert consensus"*.

Rehab Copilot is not a doctor and not a replacement for one. It is the explanation I wanted to have: what published protocols and research say about **your** week, where they disagree, and when to go and ask a real person. For someone preparing for this surgery, going through it, or stuck without a physio — from someone who has been through it twice and is still recovering.

## What it does

- **Ask** (any language, EN/RU interface): a scope check and query rewrite → two-tier retrieval → a cited answer structured as *What is typical at this stage · What to do · Where protocols differ · When to check with your clinician*. Every sentence carries a source id; an evidence panel shows the excerpt and the link.
- **Your recovery**: surgery type + date (+ optional *repeat operation*, sex, age band) → week N and the typical phase, from protection to long-term joint care. The phase is injected into every prompt, so "can I squat?" is answered for week 22, not in general. The revision flag tells the model to expect slower progression and prefer revision-outcome evidence.
- **Today's routine**: a checklist of 6–8 ≤1-minute movements and one nutrition habit for your phase, with stop-signs — built only from the curated notes.
- **Compare**: two approaches side by side as a cited table (cold vs compression, pool vs bike); *no data* where the library is silent.
- **Before your appointment**: 5–7 concrete questions for the surgeon or physio and what to note down beforehand.
- **Beyond the ankle, where the evidence applies to you**: nutrition and inflammation, protein by age, bone and tendon changes after 45 and 60, the donor knee — the profile hints steer which evidence the model prefers.

**Honesty rules baked in.** Two knowledge tiers, labelled in the UI: **438 curated notes** compiled by me from published sources during this recovery (ranked first, explicitly *not* a clinical protocol) and **1,564 open-access papers** from Europe PMC (161,183 chunks). When sources disagree, the answer gets a mandatory *Where protocols differ* section with the range and the more conservative option. A **citation guard** tags any number (weeks, grams, degrees) that has no source id. Out-of-scope questions are refused in half a second; in-scope gaps fall back to a medical-domains-only web search, clearly labelled. Self-harm wording gets a fixed warm reply with crisis lines before any model sees it. The disclaimer is on every screen; the user's own surgeon's protocol always wins.

## How we built it

Python + Streamlit. Generation is **NVIDIA Nemotron 3** on **Nebius Token Factory** through the OpenAI-compatible API: **Nano** for the fast JSON routing calls (scope check, query rewrite, sub-queries; reasoning off via `chat_template_kwargs`), **Super with reasoning on** for the evidence answer — reasoning is what made the model cite every sentence; without it citations dropped to about one per answer — and **Ultra** as an optional "Deep" mode. The curated tier is embedded with `Qwen/Qwen3-Embedding-8B` from Token Factory because the notes are mixed Russian/English; the paper tier uses a local MiniLM + FAISS with a lexical boost for rare terms. The corpus comes from the Europe PMC open-access API; indexing runs locally or as a Nebius Serverless Job. Tavily fills gaps when the library cannot answer all or part of a question. Hosted free on Streamlit Community Cloud; the prebuilt index is a GitHub Release asset downloaded on first start; a daily token budget protects the public demo from draining credits.

## Challenges

- Even with reasoning on, Super once filled *Where protocols differ* with plausible but uncited ranges. Fixed with a stricter rule (each side of a disagreement must cite, otherwise one neutral line) plus a deterministic citation guard in the UI.
- Russian questions against English embeddings returned "no data" for notes that answered them exactly — switching the curated tier to Token Factory's multilingual embeddings fixed it in an afternoon.
- Dense retrieval has no notion of scope: a question about a lumbar hernia scored *higher* than in-scope questions. A Nano scope check in front of retrieval was the only reliable fix.
- An earlier Telegram-bot version of this knowledge base gave permissive squat advice that contradicted the reference note — the two-tier design (curated notes first, *Where protocols differ* mandatory) came from that failure.
- Writing for a patient who is scared: tone rules (neutral-to-supportive, red flags stated once and calmly, no alarm words) turned out to matter as much as retrieval quality.

## Accomplishments that we're proud of

A complete, calm product rather than a demo: profile → cited answer → routine → comparison → appointment prep, with evidence visible at every step, in two languages, honest about its limits — and already useful to the person who built it, at week 22 of my own recovery.

## What we learned

Tiered models are not a cost trick only — Nano's half-second refusal is a product feature. Reasoning mode changes *what* the model does (cites), not just how well. Retrieval language matters more than model size for a bilingual library. And for a patient, "where the protocols disagree" is more reassuring than a single confident number.

## What's next

A Telegram companion that pushes the daily routine with reminders (protein, hourly movement, donor-knee care) and a small peer group of people on the same path; weekly automatic corpus refresh as a Nebius Serverless Job; per-clinic protocol upload so *Where protocols differ* can include the user's own protocol; more procedures (microfracture, ACI, allograft) with their own phase tables.

---

## Built with (tags, ≤ 25)
python, streamlit, nvidia-nemotron, nemotron-3-nano, nemotron-3-super, nemotron-3-ultra, nebius-token-factory, nebius-serverless-jobs, qwen3-embedding, faiss, sentence-transformers, rag, tavily, europe-pmc, openai-sdk, streamlit-community-cloud, github-releases

## "Try it out" links
- Live demo: https://ankle-rehab-copilot.streamlit.app
- Code (MIT): https://github.com/MargaritaSI/ankle-rehab-copilot
- Video: *(YouTube link)*

## Existed before the submission period?
Yes — see "What changed during the hackathon submission period" in the README: a never-published June 2026 retrieval prototype (Qwen on a self-hosted endpoint, Russian-only page) was rebuilt on Nemotron/Token Factory with a curated tier, phase context, three new modes, scope check, Tavily fallback, English UI, public repo, hosted demo and an evaluation script.

## Feedback on Nebius Token Factory / NVIDIA tools
- Token Factory: the OpenAI-compatible API worked first try with the `openai` SDK; `/v1/models` made model discovery trivial. Per-call reasoning control through `chat_template_kwargs.enable_thinking` is exactly the knob a tiered app needs — it deserves a prominent place in the docs with a latency/quality example. A `max_reasoning_tokens` cap would help bound tail latency (one Russian answer reasoned for 27 s).
- Nemotron 3 Nano is an excellent router/rewriter: ~1 s JSON, no format slips in 13/13 evaluation runs. Nemotron 3 Super with reasoning cites faithfully; without reasoning it drifts to uncited prose — worth stating in the model card.
- Having a strong multilingual embedding model (Qwen3-Embedding-8B) on the same endpoint as generation removed a whole local dependency; an NVIDIA embedding model there would make the stack all-Nemotron.
- Wish list: usage/cost per request in the response headers; a hosted FAISS-like vector store next to the embeddings endpoint.
