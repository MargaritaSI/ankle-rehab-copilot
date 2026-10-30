# -*- coding: utf-8 -*-
"""
Rehab Copilot — Streamlit UI.

Tabs: Ask · Today's routine · Compare · Before your appointment.
Sidebar: your surgery + date (→ recovery phase + timeline), answer depth, web fallback, tags.
Visuals live in app/ui.py (CSS + HTML blocks) and .streamlit/config.toml (theme).
Run:  streamlit run app/app.py      (needs NEBIUS_API_KEY in .env or the environment)
"""
from __future__ import annotations

import datetime as dt
import pathlib
import sys
from urllib.parse import urlparse

import streamlit as st

ASSETS = pathlib.Path(__file__).resolve().parent / "assets"
sys.path.append(str(pathlib.Path(__file__).resolve().parent.parent / "endpoint"))
import llm  # noqa: E402
import rag  # noqa: E402
import web  # noqa: E402
from phase import PHASES, SURGERIES, Profile  # noqa: E402

sys.path.append(str(pathlib.Path(__file__).resolve().parent))
import ui  # noqa: E402
from i18n import PHASE_RU, SURGERY_RU, T  # noqa: E402

if "lang" not in st.session_state:
    st.session_state["lang"] = "en"
L = T[st.session_state["lang"]]
RU = st.session_state["lang"] == "ru"


def phase_text(name: str, focus: str) -> tuple[str, str]:
    return PHASE_RU.get(name, (name, focus)) if RU else (name, focus)


def week_range(start: int, end: int | None) -> str:
    return f"{start}{'+' if end is None else '–' + str(end)} {L['wk']}"


st.set_page_config(page_title=L["page_title"], page_icon=str(ASSETS / "capy_frog.png"), layout="wide")
ui.inject()


# ----------------------------------------------------------------- helpers
def render_sources(ev: dict):
    notes, papers, webs = ev.get("notes", []), ev.get("papers", []), ev.get("web", [])
    total = len(notes) + len(papers) + len(webs)
    if not total:
        return
    ui.section_heading(L["sources_h"], total)
    if notes:
        with st.expander(L["src_notes"].format(n=len(notes)), expanded=True):
            ui.source_grid([{
                "id": n["id"], "title": n["title"], "kind": L["curated"], "chips": [n.get("facet")],
                "excerpt": n["excerpt"], "link_label": L["source"], "url": n.get("url"),
            } for n in notes])
    if papers:
        with st.expander(L["src_papers"].format(n=len(papers)), expanded=not notes):
            ui.source_grid([{
                "id": e["id"], "title": e["title"], "kind": f"{L['paper']} · {e.get('year', '')}",
                "chips": e.get("tags", []), "excerpt": e["excerpt"], "link_label": L["open_pmc"], "url": e.get("url"),
            } for e in papers])
    if webs:
        with st.expander(L["src_web"].format(n=len(webs)), expanded=True):
            ui.source_grid([{
                "id": w["id"], "title": w["title"], "kind": L["web"], "chips": [],
                "excerpt": (w.get("text") or "")[:300] + " …",
                "link_label": (urlparse(w["url"]).netloc or w["url"]) + " ↗", "url": w["url"],
            } for w in webs])


def render_calls(calls: list[dict]):
    if not calls:
        return
    parts = [f"{c['label']} · {c['purpose']} · {c['seconds']}s" + (f" · {L['reasoning']}" if c["think"] else "")
             for c in calls]
    ui.calls_footer(L["behind"], parts, L["via"])


def empty_state(key: str, img: str, text: str):
    with st.container(key=f"empty-{key}"):
        c_img, c_txt = st.columns([1, 5], vertical_alignment="center")
        c_img.image(str(ASSETS / img), width=150)
        c_txt.markdown(text)


def show_result(key: str, img: str = "", text: str = ""):
    res = st.session_state.get(key)
    if not res:
        if img:
            empty_state(key, img, text)
        return
    with st.container(key=f"card-answer-{key}", border=True):
        if res.get("source") == "web":
            st.info(L["web_info"])
        st.markdown(res["answer"])
    render_sources(res.get("evidence", {}))
    render_calls(res.get("calls", []))


def run(key: str, fn, *args, **kwargs):
    if not llm.configured():
        st.error(L["no_key"])
        return
    with st.spinner(L["spinner"], show_time=True):
        try:
            st.session_state[key] = fn(*args, **kwargs)
        except llm.BudgetExceeded as exc:
            st.warning(str(exc))
        except Exception as exc:  # surface, don't crash the page
            st.error(L["failed"].format(e=exc))


# ----------------------------------------------------------------- sidebar
with st.sidebar:
    ui.side_header(L["your_recovery"], "pebble.png")
    surgery = st.selectbox(L["surgery"], list(SURGERIES),
                           format_func=lambda k: SURGERY_RU[k] if RU else SURGERIES[k])
    has_date = st.toggle(L["know_date"], value=True)
    surgery_date = None
    if has_date:
        surgery_date = st.date_input(L["surgery_date"], value=dt.date.today() - dt.timedelta(weeks=22),
                                     min_value=dt.date(2000, 1, 1), max_value=dt.date.today())
    c_sex, c_age = st.columns(2)
    sex = c_sex.selectbox(L["sex"], list(L["sex_opts"]), format_func=lambda k: L["sex_opts"][k],
                          help=L["profile_help"])
    age_band = c_age.selectbox(L["age"], list(L["age_opts"]), format_func=lambda k: L["age_opts"][k])
    revision = st.toggle(L["revision"], value=False, help=L["revision_help"])
    poor_perf = st.toggle(L["perfusion"], value=False, help=L["perfusion_help"])
    profile = Profile(surgery=surgery, surgery_date=surgery_date, sex=sex, age_band=age_band,
                      revision=revision, poor_perfusion=poor_perf)
    if profile.phase:
        p = profile.phase
        pname, pfocus = phase_text(p["name"], p["focus"])
        ui.phase_card(L["week"], profile.weeks, f"~{profile.months} {L['months']} {L['stat_since']}",
                      pname, f"{L['weeks']} {p['start']}{'+' if p['end'] is None else '–' + str(p['end'])}", pfocus)
        rows = []
        for s_, e_, name, focus, _ in PHASES:
            n_, f_ = phase_text(name, focus)
            state = "now" if name == p["name"] else ("done" if e_ is not None and profile.weeks >= e_ else "todo")
            rows.append({"name": n_, "focus": f_, "weeks": week_range(s_, e_), "state": state})
        ui.timeline(rows, L["timeline_h"], L["now_badge"])
    else:
        st.info(L["need_date"])
    with st.expander(L["anatomy"]):
        for img, cap in zip(("Gray357.png", "Gray355.png", "Gray347.png"), L["anat"]):
            st.image(str(ASSETS / "anatomy" / img), caption=cap, width="stretch")
        st.caption(L["anat_credit"])
    st.divider()
    st.subheader(L["answers"])
    depth = st.segmented_control(L["depth"], L["depth_short_opts"], default=L["depth_short_opts"][0],
                                 help=L["depth_help"], width="stretch")
    tier = "deep" if depth == L["depth_short_opts"][1] else "strong"
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
        stats = rag.stats()
        st.caption(L["lib_caption"].format(p=stats["papers"], c=stats["paper_chunks"], n=stats["notes"]))
    except Exception as exc:
        stats = None
        st.caption(L["lib_error"].format(e=type(exc).__name__))

# ----------------------------------------------------------------- header
_t_txt, _t_lang = st.columns([8, 3], vertical_alignment="center")
with _t_txt:
    ui.hero(L["eyebrow"], "Rehab Copilot", "capy_frog.png")


def _switch_lang():
    choice = st.session_state.get("lang_pick")
    if choice:
        st.session_state["lang"] = "ru" if choice == "Русский" else "en"
        for k in ("ask_q", "preset_pick", "cmp_a", "cmp_b", "doc_topic"):
            st.session_state.pop(k, None)


with _t_lang:
    st.segmented_control(L["lang_label"], ["English", "Русский"], key="lang_pick",
                         default="Русский" if RU else "English", on_change=_switch_lang,
                         label_visibility="collapsed")

ui.subtitle(L["subtitle"])
ui.note(L["disclaimer"])

# ----------------------------------------------------------------- your week, at a glance
if profile.phase:
    p = profile.phase
    pname, pfocus = phase_text(p["name"], p["focus"])
    tiles = [
        {"k": L["stat_week"], "v": profile.weeks, "s": f"~{profile.months} {L['months']} {L['stat_since']}", "accent": True},
        {"k": L["stat_phase"], "v": pname, "size": "sm",
         "s": f"{L['weeks']} {p['start']}{'+' if p['end'] is None else '–' + str(p['end'])}"},
        {"k": L["stat_focus"], "v": pfocus, "size": "xs", "s": ""},
    ]
else:
    tiles = [
        {"k": L["stat_week"], "v": "—", "s": L["no_date_short"], "accent": True},
        {"k": L["stat_phase"], "v": L["no_date_short"], "size": "sm", "s": ""},
        {"k": L["stat_focus"], "v": L["no_date_hint"], "size": "xs", "s": ""},
    ]
if stats:
    tiles.append({"k": L["stat_library"], "v": f"{stats['papers']} {L['stat_papers']}", "size": "sm",
                  "s": L["stat_lib_sub"].format(n=stats["notes"], c=stats["paper_chunks"])})
ui.stat_grid(tiles)

tab_ask, tab_today, tab_cmp, tab_doc = st.tabs(L["tabs"])

# ----------------------------------------------------------------- Ask
with tab_ask:
    PRESETS = L["presets"]

    def _apply_preset():
        chosen = st.session_state.get("preset_pick")
        if chosen:
            st.session_state["ask_q"] = PRESETS[chosen]

    with st.container(key="card-ask", border=True):
        st.pills(L["try_one"], list(PRESETS), selection_mode="single", key="preset_pick",
                 on_change=_apply_preset)
        q = st.text_area(L["your_q"], height=130, key="ask_q", placeholder=L["q_placeholder"], max_chars=1200)
        go = st.button(L["ask_btn"], type="primary", disabled=not q.strip(), icon=":material/arrow_forward:")
    if go:
        run("ask_res", rag.answer, q, profile, tags=sel_tags or None, tier=tier, allow_web=allow_web)
    show_result("ask_res", "capy_king.png", L["ask_empty"])

# ----------------------------------------------------------------- Today
with tab_today:
    with st.container(key="card-today", border=True):
        with st.container(key="lead-today"):
            st.markdown(L["today_intro"])
        lang = L["routine_lang"]
        constraints = st.text_input(L["constraints"], placeholder=L["constraints_ph"], max_chars=200)
        if profile.weeks is None:
            st.info(L["need_date"])
        go = st.button(L["today_btn"], type="primary", disabled=profile.weeks is None, icon=":material/wb_sunny:")
    if go:
        run("today_res", rag.routine, profile, lang, constraints)
    show_result("today_res", "sun.png", L["today_empty"])

# ----------------------------------------------------------------- Compare
with tab_cmp:
    with st.container(key="card-cmp", border=True):
        with st.container(key="lead-cmp"):
            st.markdown(L["cmp_intro"])
        c1, c2 = st.columns(2, gap="medium")
        a = c1.text_input(L["cmp_a"], L["cmp_a_def"], key="cmp_a", max_chars=200)
        b = c2.text_input(L["cmp_b"], L["cmp_b_def"], key="cmp_b", max_chars=200)
        go = st.button(L["cmp_btn"], type="primary", icon=":material/compare_arrows:")
    if go:
        run("cmp_res", rag.compare, a, b, tier=tier)
    show_result("cmp_res", "pebble.png", L["cmp_empty"])

# ----------------------------------------------------------------- Doctor
with tab_doc:
    with st.container(key="card-doc", border=True):
        with st.container(key="lead-doc"):
            st.markdown(L["doc_intro"])
        topic = st.text_input(L["topic"], L["topic_def"], key="doc_topic", max_chars=200)
        go = st.button(L["doc_btn"], type="primary", icon=":material/stethoscope:")
    if go:
        run("doc_res", rag.specialist_questions, topic, profile)
    show_result("doc_res", "capy_frog.png", L["doc_empty"])
