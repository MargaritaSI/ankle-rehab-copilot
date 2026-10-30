# -*- coding: utf-8 -*-
"""
Rehab Copilot — Streamlit UI.

Tabs: Ask · Today's routine · Compare · Before your appointment.
Sidebar: your surgery + date (→ recovery phase), answer depth, web fallback, tags.
Run:  streamlit run app/app.py      (needs NEBIUS_API_KEY in .env or the environment)
"""
from __future__ import annotations

import datetime as dt
import pathlib
import sys

import streamlit as st

sys.path.append(str(pathlib.Path(__file__).resolve().parent.parent / "endpoint"))
import llm  # noqa: E402
import rag  # noqa: E402
import web  # noqa: E402
from phase import PHASES, SURGERIES, Profile  # noqa: E402

st.set_page_config(page_title="Rehab Copilot — ankle cartilage recovery",
                   page_icon="🦶", layout="wide")

st.markdown("""
<style>
.block-container {padding-top: 2rem; max-width: 1150px;}
h1 {font-weight: 700; letter-spacing: -0.4px; margin-bottom: 0.2rem;}
.chip {display:inline-block; padding:2px 10px; margin:2px 4px 2px 0; border-radius:12px;
       background:#EEF2FF; color:#4338CA; font-size:0.72rem; font-weight:600;}
.chip.kb {background:#ECFDF5; color:#047857;}
.chip.web {background:#FFF7ED; color:#C2410C;}
.chip.model {background:#F3F4F6; color:#374151; font-weight:500;}
.src {border:1px solid #E5E7EB; border-radius:12px; padding:12px 14px; margin-bottom:8px; background:#fff;}
.src .t {font-weight:600; font-size:0.9rem; color:#111827;}
.src .x {color:#374151; font-size:0.84rem; margin-top:5px; line-height:1.45;}
.src .id {color:#6366F1; font-weight:700;}
.phase {border-left:4px solid #6366F1; background:#F5F3FF; padding:10px 14px; border-radius:8px;
        font-size:0.9rem; margin-bottom:8px;}
.stButton>button {border-radius:10px; font-weight:600;}
.footer {color:#6B7280; font-size:0.78rem; margin-top:14px;}
</style>
""", unsafe_allow_html=True)

DISCLAIMER_UI = ("Educational summary of published protocols and research — **not medical advice** "
                 "and not a clinical protocol. Protocols differ between clinics; your surgeon's "
                 "protocol always wins. Ask in any language.")


# ----------------------------------------------------------------- helpers
def chips(items, cls=""):
    return " ".join(f"<span class='chip {cls}'>{i}</span>" for i in items)


def render_sources(ev: dict):
    notes, papers, webs = ev.get("notes", []), ev.get("papers", []), ev.get("web", [])
    if notes:
        with st.expander(f"Curated notes · {len(notes)} (author's reviewed notes, talus OAT specific)",
                         expanded=False):
            for n in notes:
                link = f"<a href='{n['url']}' target='_blank'>source ↗</a>" if n["url"] else ""
                st.markdown(
                    f"<div class='src'><div class='t'><span class='id'>[{n['id']}]</span> {n['title']}"
                    f" {chips([n['facet']], 'kb')}</div><div class='x'>{n['excerpt']}</div>{link}</div>",
                    unsafe_allow_html=True)
    if papers:
        with st.expander(f"Open-access papers · {len(papers)} (PubMed Central)", expanded=False):
            for e in papers:
                st.markdown(
                    f"<div class='src'><div class='t'><span class='id'>[{e['id']}]</span> {e['title']}"
                    f" <span style='color:#6B7280'>{e.get('year', '')}</span> {chips(e.get('tags', []))}"
                    f"</div><div class='x'>{e['excerpt']}</div>"
                    f"<a href='{e['url']}' target='_blank'>open on PMC ↗</a></div>",
                    unsafe_allow_html=True)
    if webs:
        with st.expander(f"Web sources · {len(webs)} (Tavily, medical domains — not from the library)",
                         expanded=True):
            for w in webs:
                st.markdown(
                    f"<div class='src'><div class='t'><span class='id'>[{w['id']}]</span> {w['title']}"
                    f" {chips(['web'], 'web')}</div><div class='x'>{w['text'][:300]} …</div>"
                    f"<a href='{w['url']}' target='_blank'>{w['url']}</a></div>",
                    unsafe_allow_html=True)


def render_calls(calls: list[dict]):
    if not calls:
        return
    parts = [f"{c['label']} · {c['purpose']} · {c['seconds']}s" + (" · reasoning" if c["think"] else "")
             for c in calls]
    st.markdown(f"<div class='footer'>{chips(parts, 'model')} via Nebius Token Factory</div>",
                unsafe_allow_html=True)


def show_result(key: str):
    res = st.session_state.get(key)
    if not res:
        return
    if res.get("source") == "web":
        st.info("The local library had nothing on this, so these are **web sources** from medical "
                "domains (Tavily). Treat them as a starting point, not as the curated tier.")
    st.markdown(res["answer"])
    st.divider()
    render_sources(res.get("evidence", {}))
    render_calls(res.get("calls", []))


def run(key: str, fn, *args, **kwargs):
    if not llm.configured():
        st.error("NEBIUS_API_KEY is not set. Add it to .env (see .env.example).")
        return
    with st.spinner("Nemotron Nano routes the question · Nemotron Super reads the evidence…"):
        try:
            st.session_state[key] = fn(*args, **kwargs)
        except Exception as exc:  # surface, don't crash the page
            st.error(f"Model call failed: {exc}")


# ----------------------------------------------------------------- sidebar
with st.sidebar:
    st.header("Your recovery")
    surgery = st.selectbox("Surgery", list(SURGERIES), format_func=lambda k: SURGERIES[k])
    has_date = st.toggle("I know my surgery date", value=True)
    surgery_date = None
    if has_date:
        surgery_date = st.date_input("Surgery date", value=dt.date.today() - dt.timedelta(weeks=22),
                                     min_value=dt.date(2000, 1, 1), max_value=dt.date.today())
    profile = Profile(surgery=surgery, surgery_date=surgery_date)
    if profile.phase:
        p = profile.phase
        end = "+" if p["end"] is None else f"–{p['end']}"
        st.markdown(f"<div class='phase'><b>Week {profile.weeks}</b> · ~{profile.months} months<br>"
                    f"Typical phase: <b>{p['name']}</b> (weeks {p['start']}{end})<br>"
                    f"<span style='color:#4B5563'>{p['focus']}</span></div>", unsafe_allow_html=True)
        with st.expander("All phases (typical ranges)"):
            for s_, e_, name, focus, _ in PHASES:
                st.markdown(f"**{s_}{'+' if e_ is None else '–' + str(e_)} wk — {name}**  \n{focus}")
    st.divider()
    st.header("Answers")
    depth = st.radio("Depth", ["Standard — Nemotron Super", "Deep — Nemotron Ultra"], index=0)
    tier = "deep" if depth.startswith("Deep") else "strong"
    allow_web = st.toggle("Search the web when the library is silent (Tavily)",
                          value=web.available(), disabled=not web.available(),
                          help="Needs TAVILY_API_KEY. Restricted to medical domains; results are labelled.")
    sel_tags = st.multiselect("Restrict papers to topics", rag.all_tags())
    st.divider()
    try:
        s_ = rag.stats()
        st.caption(f"Library: {s_['papers']} open-access papers ({s_['paper_chunks']:,} chunks) + "
                   f"{s_['notes']} curated notes · local FAISS · generation on NVIDIA Nemotron "
                   f"via Nebius Token Factory")
    except Exception as exc:
        st.caption(f"Library not loaded: {exc}")

# ----------------------------------------------------------------- header
st.title("🦶 Rehab Copilot")
st.caption("Recovery after ankle cartilage surgery (talus OAT / mosaicplasty) — what published protocols "
           "and research actually say, with a source on every claim, anchored to *your* week.")
st.warning(DISCLAIMER_UI)

tab_ask, tab_today, tab_cmp, tab_doc = st.tabs(
    ["Ask", "Today's routine", "Compare", "Before your appointment"])

# ----------------------------------------------------------------- Ask
with tab_ask:
    PRESETS = {
        "Swelling after standing": "I'm 5 months after ankle cartilage surgery; the leg swells after 2 hours of standing or sitting in a car. What do studies say about why, and what helps?",
        "Protein per day": "How many grams of protein per day for muscle and bone recovery, and which foods are absorbed best?",
        "Caffeine & calcium": "Does coffee / caffeine affect calcium, bone healing or joint inflammation? How much is too much, and how to offset it?",
        "Squats at month 5": "Can I squat at month 5 and how deep?",
        "Running": "When can I start running again, and what has to be true first?",
        "Donor knee on stairs": "How do I unload the donor knee when going down stairs?",
        "Dienogest & bone": "Does long-term dienogest affect bone density, and what does that mean for recovery?",
        "Contrast shower": "Does a contrast shower (cold / warm) help swelling after surgery? Cold vs compression?",
        "Out of scope test": "Which running-shoe brand is best for ankle recovery?",
    }
    def _apply_preset():
        chosen = st.session_state.get("preset_pick")
        if chosen:
            st.session_state["ask_q"] = PRESETS[chosen]

    st.pills("Try one", list(PRESETS), selection_mode="single", key="preset_pick",
             on_change=_apply_preset)
    q = st.text_area("Your question (any language)", height=90, key="ask_q",
                     placeholder="e.g. Прошло 5 месяцев, нога отекает после 2 часов стоя — что делать?")
    if st.button("Ask", type="primary", disabled=not q.strip()):
        run("ask_res", rag.answer, q, profile, tags=sel_tags or None, tier=tier, allow_web=allow_web)
    show_result("ask_res")

# ----------------------------------------------------------------- Today
with tab_today:
    st.markdown("A **micro-routine for today**: many ≤1-minute sets through the day, built only from the "
                "curated notes for your phase. Tick items as you go; regenerate tomorrow.")
    lang = st.selectbox("Language", ["English", "Russian", "Dutch", "German", "Spanish"], index=0)
    constraints = st.text_input("Anything to respect today? (optional)",
                                placeholder="e.g. desk day, mild swelling last night, no gym access")
    if profile.weeks is None:
        st.info("Set your surgery date in the sidebar so the routine matches your phase.")
    if st.button("Build today's routine", type="primary", disabled=profile.weeks is None):
        run("today_res", rag.routine, profile, lang, constraints)
    show_result("today_res")

# ----------------------------------------------------------------- Compare
with tab_cmp:
    st.markdown("Put two approaches side by side — the model fills a table **only** from the sources and "
                "writes *no data* where the library is silent.")
    c1, c2 = st.columns(2)
    a = c1.text_input("Approach A", "cryotherapy / cold for post-operative swelling")
    b = c2.text_input("Approach B", "compression for post-operative swelling")
    if st.button("Compare", type="primary"):
        run("cmp_res", rag.compare, a, b, tier=tier)
    show_result("cmp_res")

# ----------------------------------------------------------------- Doctor
with tab_doc:
    st.markdown("Appointments are short. Get **specific questions** for your surgeon or physio, grounded in "
                "what the sources discuss, plus what to note down beforehand.")
    topic = st.text_input("Topic", "persistent ankle swelling 5 months after cartilage surgery")
    if st.button("Prepare questions", type="primary"):
        run("doc_res", rag.specialist_questions, topic, profile)
    show_result("doc_res")
