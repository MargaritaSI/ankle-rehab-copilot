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

ASSETS = pathlib.Path(__file__).resolve().parent / "assets"
sys.path.append(str(pathlib.Path(__file__).resolve().parent.parent / "endpoint"))
import llm  # noqa: E402
import rag  # noqa: E402
import web  # noqa: E402
from phase import PHASES, SURGERIES, Profile  # noqa: E402

sys.path.append(str(pathlib.Path(__file__).resolve().parent))
from i18n import PHASE_RU, SURGERY_RU, T  # noqa: E402

if "lang" not in st.session_state:
    st.session_state["lang"] = "en"
L = T[st.session_state["lang"]]
RU = st.session_state["lang"] == "ru"


def phase_text(name: str, focus: str) -> tuple[str, str]:
    return PHASE_RU.get(name, (name, focus)) if RU else (name, focus)


st.set_page_config(page_title=L["page_title"], page_icon=str(ASSETS / "capy_frog.png"), layout="wide")

st.markdown("""
<style>
.block-container {padding-top: 2rem; max-width: 1150px;}
h1 {margin-bottom: 0.2rem;}
.chip {display:inline-block; padding:1px 8px; margin:2px 4px 2px 0; border-radius:4px;
       border:1px solid #D6D3CB; color:#6B706C; font-size:0.74rem; background:transparent;}
.kind {color:#6B706C; font-size:0.76rem; margin-left:6px;}
.src {border:1px solid #DAD6CC; border-radius:6px; padding:12px 14px; margin-bottom:8px; background:transparent;}
.src .t {font-size:0.92rem;}
.src .x {color:#3F4643; font-size:0.84rem; margin-top:5px; line-height:1.45;}
.src .id {color:#2F6F6D;}
.phase {border-left:2px solid #2F6F6D; padding:4px 0 4px 12px; font-size:0.9rem; margin-bottom:8px;}
.footer {color:#6B706C; font-size:0.78rem; margin-top:14px;}
</style>
""", unsafe_allow_html=True)



# ----------------------------------------------------------------- helpers
def chips(items):
    return " ".join(f"<span class='chip'>{i}</span>" for i in items)


def render_sources(ev: dict):
    notes, papers, webs = ev.get("notes", []), ev.get("papers", []), ev.get("web", [])
    if notes:
        with st.expander(L["src_notes"].format(n=len(notes)),
                         expanded=False):
            for n in notes:
                link = f"<a href='{n['url']}' target='_blank'>{L['source']}</a>" if n["url"] else ""
                st.markdown(
                    f"<div class='src'><div class='t'><span class='id'>[{n['id']}]</span> {n['title']}"
                    f" <span class='kind'>{L['curated']}</span> {chips([n['facet']])}</div><div class='x'>{n['excerpt']}</div>{link}</div>",
                    unsafe_allow_html=True)
    if papers:
        with st.expander(L["src_papers"].format(n=len(papers)), expanded=False):
            for e in papers:
                st.markdown(
                    f"<div class='src'><div class='t'><span class='id'>[{e['id']}]</span> {e['title']}"
                    f" <span class='kind'>{L['paper']} · {e.get('year', '')}</span> {chips(e.get('tags', []))}"
                    f"</div><div class='x'>{e['excerpt']}</div>"
                    f"<a href='{e['url']}' target='_blank'>{L['open_pmc']}</a></div>",
                    unsafe_allow_html=True)
    if webs:
        with st.expander(L["src_web"].format(n=len(webs)),
                         expanded=True):
            for w in webs:
                st.markdown(
                    f"<div class='src'><div class='t'><span class='id'>[{w['id']}]</span> {w['title']}"
                    f" <span class='kind'>{L['web']}</span></div><div class='x'>{w['text'][:300]} …</div>"
                    f"<a href='{w['url']}' target='_blank'>{w['url']}</a></div>",
                    unsafe_allow_html=True)


def render_calls(calls: list[dict]):
    if not calls:
        return
    parts = [f"{c['label']} · {c['purpose']} · {c['seconds']}s" + (f" · {L['reasoning']}" if c["think"] else "")
             for c in calls]
    st.markdown(f"<div class='footer'>{chips(parts)} {L['via']}</div>",
                unsafe_allow_html=True)


def empty_state(img: str, text: str):
    c_img, c_txt = st.columns([1, 6], vertical_alignment="center")
    c_img.image(str(ASSETS / img), width=120)
    c_txt.markdown(text)


def show_result(key: str, img: str = "", text: str = ""):
    res = st.session_state.get(key)
    if not res:
        if img:
            empty_state(img, text)
        return
    if res.get("source") == "web":
        st.info(L["web_info"])
    st.markdown(res["answer"])
    st.divider()
    render_sources(res.get("evidence", {}))
    render_calls(res.get("calls", []))


def run(key: str, fn, *args, **kwargs):
    if not llm.configured():
        st.error(L["no_key"])
        return
    with st.spinner(L["spinner"]):
        try:
            st.session_state[key] = fn(*args, **kwargs)
        except llm.BudgetExceeded as exc:
            st.warning(str(exc))
        except Exception as exc:  # surface, don't crash the page
            st.error(L["failed"].format(e=exc))


# ----------------------------------------------------------------- sidebar
with st.sidebar:
    st.image(str(ASSETS / "pebble.png"), width=80)
    st.header(L["your_recovery"])
    surgery = st.selectbox(L["surgery"], list(SURGERIES),
                           format_func=lambda k: SURGERY_RU[k] if RU else SURGERIES[k])
    has_date = st.toggle(L["know_date"], value=True)
    surgery_date = None
    if has_date:
        surgery_date = st.date_input(L["surgery_date"], value=dt.date.today() - dt.timedelta(weeks=22),
                                     min_value=dt.date(2000, 1, 1), max_value=dt.date.today())
    profile = Profile(surgery=surgery, surgery_date=surgery_date)
    if profile.phase:
        p = profile.phase
        end = "+" if p["end"] is None else f"–{p['end']}"
        pname, pfocus = phase_text(p["name"], p["focus"])
        st.markdown(f"<div class='phase'><b>{L['week']} {profile.weeks}</b> · ~{profile.months} {L['months']}<br>"
                    f"{L['typical_phase']}: <b>{pname}</b> ({L['weeks']} {p['start']}{end})<br>"
                    f"<span style='color:#6B706C'>{pfocus}</span></div>", unsafe_allow_html=True)
        with st.expander(L["all_phases"]):
            for s_, e_, name, focus, _ in PHASES:
                n_, f_ = phase_text(name, focus)
                st.markdown(f"**{s_}{'+' if e_ is None else '–' + str(e_)} {L['wk']} — {n_}**  \n{f_}")
    st.divider()
    st.header(L["answers"])
    depth = st.radio(L["depth"], L["depth_opts"], index=0)
    tier = "deep" if depth == L["depth_opts"][1] else "strong"
    allow_web = st.toggle(L["web_toggle"], value=web.available(), disabled=not web.available(),
                          help=L["web_help"])
    try:
        _tags = rag.all_tags()
    except Exception as exc:
        st.error(L["lib_error"].format(e=type(exc).__name__))
        st.stop()
    sel_tags = st.multiselect(L["tags"], _tags)
    u = llm.usage_today()
    if u["budget"]:
        pct = int(u["fraction"] * 100)
        st.progress(u["fraction"], text=L["budget"].format(pct=pct, n=u["requests"]))
        if pct >= 80:
            st.warning(L["budget_warn"])
    st.divider()
    try:
        s_ = rag.stats()
        st.caption(L["lib_caption"].format(p=s_["papers"], c=s_["paper_chunks"], n=s_["notes"]))
    except Exception as exc:
        st.caption(L["lib_error"].format(e=type(exc).__name__))

# ----------------------------------------------------------------- header
_t_img, _t_txt, _t_lang = st.columns([1, 9, 4], vertical_alignment="center")
_t_img.image(str(ASSETS / "capy_frog.png"), width=56)
_t_txt.title("Rehab Copilot")


def _switch_lang():
    choice = st.session_state.get("lang_pick")
    if choice:
        st.session_state["lang"] = "ru" if choice == "Русский" else "en"
        for k in ("ask_q", "preset_pick", "cmp_a", "cmp_b", "doc_topic"):
            st.session_state.pop(k, None)


_t_lang.segmented_control(L["lang_label"], ["English", "Русский"], key="lang_pick",
                          default="Русский" if RU else "English", on_change=_switch_lang,
                          label_visibility="collapsed")
st.caption(L["subtitle"])
st.warning(L["disclaimer"])

tab_ask, tab_today, tab_cmp, tab_doc = st.tabs(L["tabs"])

# ----------------------------------------------------------------- Ask
with tab_ask:
    PRESETS = L["presets"]

    def _apply_preset():
        chosen = st.session_state.get("preset_pick")
        if chosen:
            st.session_state["ask_q"] = PRESETS[chosen]

    st.pills(L["try_one"], list(PRESETS), selection_mode="single", key="preset_pick",
             on_change=_apply_preset)
    q = st.text_area(L["your_q"], height=90, key="ask_q", placeholder=L["q_placeholder"], max_chars=1200)
    if st.button(L["ask_btn"], type="primary", disabled=not q.strip()):
        run("ask_res", rag.answer, q, profile, tags=sel_tags or None, tier=tier, allow_web=allow_web)
    show_result("ask_res", "capy_king.png", L["ask_empty"])

# ----------------------------------------------------------------- Today
with tab_today:
    st.markdown(L["today_intro"])
    lang = L["routine_lang"]
    constraints = st.text_input(L["constraints"], placeholder=L["constraints_ph"], max_chars=200)
    if profile.weeks is None:
        st.info(L["need_date"])
    if st.button(L["today_btn"], type="primary", disabled=profile.weeks is None):
        run("today_res", rag.routine, profile, lang, constraints)
    show_result("today_res", "sun.png", L["today_empty"])

# ----------------------------------------------------------------- Compare
with tab_cmp:
    st.markdown(L["cmp_intro"])
    c1, c2 = st.columns(2)
    a = c1.text_input(L["cmp_a"], L["cmp_a_def"], key="cmp_a", max_chars=200)
    b = c2.text_input(L["cmp_b"], L["cmp_b_def"], key="cmp_b", max_chars=200)
    if st.button(L["cmp_btn"], type="primary"):
        run("cmp_res", rag.compare, a, b, tier=tier)
    show_result("cmp_res", "pebble.png", L["cmp_empty"])

# ----------------------------------------------------------------- Doctor
with tab_doc:
    st.markdown(L["doc_intro"])
    topic = st.text_input(L["topic"], L["topic_def"], key="doc_topic", max_chars=200)
    if st.button(L["doc_btn"], type="primary"):
        run("doc_res", rag.specialist_questions, topic, profile)
    show_result("doc_res", "capy_frog.png", L["doc_empty"])
