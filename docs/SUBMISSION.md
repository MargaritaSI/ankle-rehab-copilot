# Devpost submission texts

## Project name
Rehab Copilot — evidence Q&A and daily routine after ankle cartilage surgery

## Tagline
Published protocols and research, cited sentence by sentence, anchored to your week after surgery — on NVIDIA Nemotron via Nebius Token Factory.

## Track
Best Apps and Agents

## Inspiration
Five months ago I had an osteochondral autograft (mosaicplasty): cartilage moved from my knee into my ankle. The surgery is well documented; the months after it are not. Insurance physio is a short slot every few weeks, and between slots every question — is swelling at month 5 normal, can I squat, how much protein, how do I protect the donor knee on stairs — is answered by forums or by a chatbot that guesses confidently. One of the papers in my library is literally titled "ChatGPT-4 responses on ankle cartilage surgery often diverge from expert consensus". I wanted the opposite: an assistant that only says what published sources say, shows where they disagree, and knows which week I am in.

## What it does
- **Ask** (any language): scope check and query rewrite by Nemotron 3 Nano → two-tier retrieval (438 curated notes compiled from published sources + 743 open-access papers from Europe PMC) → an answer by Nemotron 3 Super with reasoning on, structured as *What is typical at this stage · What to do · Where protocols differ · When to check with your clinician*, every sentence with a source id and an evidence panel with excerpts and links.
- **Recovery phase**: surgery type + date → week N and the typical phase; injected into every prompt.
- **Today's routine**: a checklist of ≤1-minute movements and one nutrition habit for the user's phase, with stop-signs — built only from the curated notes.
- **Compare**: two approaches as a cited table, "no data" where the library is silent.
- **Before your appointment**: concrete questions for the surgeon/physio and what to note down.
- **Honesty**: out-of-scope questions are refused in half a second; in-scope questions the library cannot answer fall back to Tavily restricted to medical domains and are labelled as web sources; the app never presents itself as medical advice.

## How we built it
Python + Streamlit. Generation is NVIDIA Nemotron 3 on Nebius Token Factory through the OpenAI-compatible API: Nano for the fast JSON routing calls (reasoning off via `chat_template_kwargs`), Super with reasoning on for the evidence answer (reasoning is what made the model cite every sentence — without it citations dropped to one per answer), Ultra as an optional "Deep" mode. The curated tier is embedded with `Qwen/Qwen3-Embedding-8B` from Token Factory because the notes are mixed Russian/English; the paper tier uses a local MiniLM + FAISS over 50,610 chunks with a lexical boost for rare terms. The corpus comes from the Europe PMC open-access API (no key); indexing is a job that runs locally or as a Nebius Serverless Job. Tavily fills gaps: when the library cannot answer all or part of a question, a medical-domains-only web search is added and those parts are labelled as web sources. A citation guard tags any numeric claim (weeks, minutes, grams) that carries no source id. Hosted free on Streamlit Community Cloud (https://ankle-rehab-copilot.streamlit.app); the prebuilt index is a GitHub Release asset downloaded on first start; a daily token budget protects the public demo from draining credits.

## Challenges
- Even with reasoning on, Super once filled "Where protocols differ" with plausible but uncited ranges. Fixed with a stricter rule (every side of a disagreement must cite, otherwise one neutral line) plus a deterministic citation guard that tags unsourced numeric claims in the UI.
- Russian questions against English embeddings returned "no data" for notes that answered the question exactly — switching the curated tier to Token Factory's multilingual embeddings fixed it in one afternoon.
- Super without reasoning wrote fluent answers with almost no citations; with reasoning on it cited every sentence, so the extra seconds are worth it.
- Dense retrieval has no notion of scope: a question about lumbar herniation scored *higher* than in-scope questions. A Nano scope check in front of retrieval was the only reliable fix.
- The earlier Telegram-bot version of this knowledge base gave permissive squat advice that contradicted the reference note — the two-tier design (curated notes ranked first, "Where protocols differ" mandatory) came from that failure.

## Accomplishments
A complete, calm product rather than a demo: profile → cited answer → routine → comparison → appointment prep, with evidence visible at every step, multilingual, and honest about its limits.

## What we learned
Tiered models are not a cost trick only — Nano's half-second refusal is a product feature. Reasoning mode changes *what* the model does (cites) not just how well. Retrieval language matters more than model size for a bilingual library.

## What's next
Push the daily routine into a Telegram companion with reminders (protein, hourly movement, donor-knee care) and a small peer group; weekly automatic corpus refresh as a Nebius Serverless Job; per-clinic protocol upload so "Where protocols differ" can include the user's own protocol.

## Built with
python, streamlit, nvidia-nemotron, nebius-token-factory, faiss, sentence-transformers, tavily, streamlit-community-cloud

## Feedback on Nebius Token Factory / NVIDIA tools
- Token Factory: the OpenAI-compatible API worked first try with the `openai` SDK; `/v1/models` made model discovery trivial. Per-call reasoning control through `chat_template_kwargs.enable_thinking` is exactly the knob a tiered app needs — it deserves a prominent place in the docs with a latency/quality example. A `max_reasoning_tokens` cap would help bound tail latency (one Russian answer reasoned for 27 s).
- Nemotron 3 Nano is an excellent router/rewriter: ~1 s JSON, no format slips in 13/13 evaluation runs. Nemotron 3 Super with reasoning cites faithfully; without reasoning it drifts to uncited prose — worth stating in the model card.
- Having a strong multilingual embedding model (Qwen3-Embedding-8B) on the same endpoint as generation removed a whole local dependency; an NVIDIA embedding model there would make the stack all-Nemotron.
- Wish list: usage/cost per request in the response headers; a hosted FAISS-like vector store next to the embeddings endpoint.

## Existed before the submission period?
Yes — see "What changed during the hackathon submission period" in the README: a never-published June 2026 retrieval prototype (Qwen on a self-hosted endpoint, Russian-only page) was rebuilt on Nemotron/Token Factory with a curated tier, phase context, three new modes, scope check, Tavily fallback, English UI, public repo, hosted demo and an evaluation script.

## Links
- Demo: https://ankle-rehab-copilot.streamlit.app
- Code (MIT): https://github.com/MargaritaSI/ankle-rehab-copilot
