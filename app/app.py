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
import importlib
import json
import re
import pathlib
import sys
from urllib.parse import urlparse

import streamlit as st

# Telegram companion bot linked from the bottom-right card — change the username here only.
TELEGRAM_BOT_URL = "https://t.me/addmove_bot"

ASSETS = pathlib.Path(__file__).resolve().parent / "assets"
ROOT = ASSETS.parent.parent
sys.path.append(str(pathlib.Path(__file__).resolve().parent))
from proc_state import LIBRARY_LOCK  # noqa: E402
sys.path.append(str(pathlib.Path(__file__).resolve().parent.parent / "endpoint"))
import llm  # noqa: E402
import rag  # noqa: E402

# Streamlit Cloud hot-reloads this script on a push but keeps already-imported modules in
# memory, so a pushed change to endpoint/*.py silently never runs until someone reboots the
# app (2026-10-30: the live demo kept answering with the pre-cleanup rag.py for an hour).
# Guard: whenever an endpoint file on disk is newer than the copy we loaded, reload the whole
# chain in dependency order; the index caches rebuild on the next call (a few seconds, once).
_ENDPOINT_CHAIN = ("llm", "guard", "web", "phase", "kb", "rag")


def _reload_endpoint_if_stale() -> None:
    import os
    mods = [sys.modules[n] for n in _ENDPOINT_CHAIN if n in sys.modules]
    for m in mods:
        if not hasattr(m, "_loaded_mtime"):
            m._loaded_mtime = os.path.getmtime(m.__file__)
    stale = any(os.path.getmtime(m.__file__) > m._loaded_mtime + 1 for m in mods)
    # One-time marker for the deploy this guard ships in (the running rag predates it).
    stale = stale or not hasattr(sys.modules["rag"], "_RU_FALLBACK")
    if not stale:
        return
    import gc
    with LIBRARY_LOCK:
        # Another session may have reloaded while we waited for the lock.
        if all(os.path.getmtime(m.__file__) <= m._loaded_mtime + 1 for m in mods) \
                and hasattr(sys.modules["rag"], "_RU_FALLBACK"):
            return
        # Drop the old index / store / model BEFORE loading new ones: reload re-executes the
        # module in place, so without this the process briefly held two copies (~800 MB).
        for m in mods:
            for attr in ("_store", "_index", "_model"):
                if hasattr(m, attr):
                    setattr(m, attr, None)
        gc.collect()
        for name in _ENDPOINT_CHAIN:
            mod = importlib.import_module(name)
            mod = importlib.reload(mod)
            mod._loaded_mtime = os.path.getmtime(mod.__file__)


_reload_endpoint_if_stale()
import rag  # noqa: E402, F811  (rebind after a possible reload)
import web  # noqa: E402
from phase import PHASES, SURGERIES, Profile  # noqa: E402

sys.path.append(str(pathlib.Path(__file__).resolve().parent))
import ui  # noqa: E402
import i18n as _i18n  # noqa: E402

# Streamlit Cloud hot-reloads this script on a push but keeps already-imported modules in
# memory; a new string key in app.py then raises KeyError until someone reboots the app.
# The strings module is a plain dict literal, so reloading it on every run is free and safe.
importlib.reload(_i18n)
ui = importlib.reload(ui)
from i18n import PHASE_RU, SURGERY_RU, T  # noqa: E402

def _browser_lang() -> str:
    """First visit: follow the browser locale — a Russian browser opens RU, everyone else EN.
    The person can still flip the switch in the header; the choice then sticks for the session."""
    try:
        loc = (st.context.locale or "").lower()
    except Exception:
        loc = ""
    return "ru" if loc.startswith("ru") else "en"


if "lang" not in st.session_state:
    st.session_state["lang"] = _browser_lang()
L = T[st.session_state["lang"]]
RU = st.session_state["lang"] == "ru"
# One answer language: every model call gets the interface language, whatever language the
# question was typed in (owner: an English UI must never return a Russian answer).
UI_LANG = st.session_state["lang"]


def phase_text(name: str, focus: str) -> tuple[str, str]:
    return PHASE_RU.get(name, (name, focus)) if RU else (name, focus)


def week_range(start: int, end: int | None) -> str:
    return f"{start}{'+' if end is None else '–' + str(end)} {L['wk']}"


st.set_page_config(page_title=L["page_title"], page_icon=str(ASSETS / "capy_frog.png"), layout="wide")
ui.inject()


# ----------------------------------------------------------------- helpers
_PERSONAL = {"author_experience", "ocd_talus_personal"}


@st.cache_resource(show_spinner=False)
def _paper_types() -> dict:
    try:
        return json.loads((ROOT / "endpoint" / "paper_types.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


_PT_KEY = {"guideline": "pt_guideline", "review": "pt_review", "abstract": "pt_abstract", "study": "pt_study"}


def paper_type(pmcid: str, title: str) -> str:
    """Publication type (Europe PMC metadata, tool/fetch_paper_types.py); title heuristic as fallback."""
    known = _paper_types().get(pmcid)
    if known in _PT_KEY:
        return L[_PT_KEY[known]]
    t = (title or "").lower()
    if re.search(r"abstracts?\b|congress|proceedings|annual meeting|symposium", t):
        return L["pt_abstract"]
    if re.search(r"systematic review|meta-analys|\breview\b|umbrella", t):
        return L["pt_review"]
    if (re.search(r"guidelines?\b|consensus (statement|on|for)|international consensus|delphi|"
                  r"position statement|recommendations\b|protocol", t)
            and not re.search(r"study protocol|trial protocol|protocol for a|adherence|compliance|"
                                r"efficacy|effects? of|case series|outcomes?|randomi|trial|cohort|implementation|enhancing", t)):
        return L["pt_guideline"]
    return L["pt_study"]


def tag_name(tag: str) -> str:
    return L.get("tag_names", {}).get(tag, tag.replace("_", " "))


def note_kind(n: dict) -> str:
    """Honest label for a curated-tier note: `kind` comes from endpoint/kb.py (curated = the author's
    own hand-written note, excerpt = a passage of a published article the author picked,
    personal = n=1 experience). Older evidence without `kind` falls back to the same rule."""
    kind = n.get("kind")
    if not kind:
        if n.get("file") in _PERSONAL or n.get("topic") in _PERSONAL:
            kind = "personal"
        else:
            kind = "excerpt" if (n.get("url") or "").strip() else "curated"
    return L.get(f"nk_{kind}", L["nk_curated"])


_SRC_ID = r"(?:KB-\d+|PMC\d+|WEB-\d+|PHASE)"
_CITE_GROUP = re.compile(rf"\[({_SRC_ID}(?:\s*[,;]\s*{_SRC_ID})*)\]")
_CYR = re.compile(r"[А-Яа-яЁё]")


def _cited_ids(text: str) -> list[str]:
    """Source ids in the order the answer first cites them ([KB-5, KB-9] counts as two)."""
    seen, out = set(), []
    for m in _CITE_GROUP.finditer(text or ""):
        for sid in re.split(r"\s*[,;]\s*", m.group(1)):
            if sid not in seen:
                seen.add(sid)
                out.append(sid)
    return out


def _pmc_url(sid: str) -> str:
    return f"https://pmc.ncbi.nlm.nih.gov/articles/{sid}/"


def _phase_card(ph: dict) -> dict:
    """The [PHASE] source: the typical phase for the person's week, from the app's own timeline
    (endpoint/phase.py). No external link — it is not a study and says so on the card."""
    ru = L.get("phase_ru", {}).get(ph.get("name"), {})
    name = ru.get("name") or ph.get("name", "")
    focus = ru.get("focus") or ph.get("focus", "")
    caution = ru.get("caution") or ph.get("caution", "")
    end = L["phase_onwards"] if ph.get("end") is None else str(ph.get("end"))
    return {"id": "PHASE", "kind": L["phase_kind"], "chips": [L["phase_chip"]],
            "title": L["phase_title"].format(w=ph.get("weeks"), name=name, start=ph.get("start"), end=end),
            "excerpt": L["phase_excerpt"].format(focus=focus, caution=caution),
            "link_label": "", "url": None}


def _source_cards(ev: dict) -> dict[str, dict]:
    """id → card for every retrieved source (phase, notes, papers, web), in the UI language."""
    cards: dict[str, dict] = {}
    if ev.get("phase"):
        cards["PHASE"] = _phase_card(ev["phase"])
    for n in ev.get("notes", []):
        chips = [(n.get("facet_ru") if RU else None) or n.get("facet")]
        cyr = bool(_CYR.search((n.get("title") or "") + (n.get("text") or "")[:200]))
        if cyr and not RU:
            chips.append(L["note_ru"])          # a Russian note shown under the English UI
        elif not cyr and RU:
            chips.append(L["note_en"])
        cards[n["id"]] = {
            "id": n["id"], "title": n["title"], "kind": note_kind(n), "chips": chips,
            "full": n.get("text"), "full_label": L["show_full"],
            "excerpt": n["excerpt"], "link_label": L["source"], "url": n.get("url")}
    for e in ev.get("papers", []):
        cards[e["id"]] = {
            "id": e["id"], "title": e["title"],
            "kind": f"{L['paper']} · {paper_type(e['id'], e['title'])} · {e.get('year', '')}",
            "chips": [tag_name(x) for x in e.get("tags", [])], "excerpt": e["excerpt"],
            "link_label": L["open_pmc"], "url": e.get("url")}
    for w in ev.get("web", []):
        cards[w["id"]] = {
            "id": w["id"], "title": w["title"], "kind": L["web"], "chips": [],
            "excerpt": (w.get("text") or "")[:300] + " …",
            "link_label": (urlparse(w["url"]).netloc or w["url"]) + " ↗", "url": w["url"]}
    return cards


def link_citations(text: str, ev: dict) -> str:
    """Every [KB-n] / [PMCxxxx] / [WEB-n] in the answer becomes a link: papers and web results open
    the original (the title shows on hover), notes without a page jump to their card below."""
    cards = _source_cards(ev)

    def one(sid: str) -> str:
        c = cards.get(sid, {})
        url = c.get("url") or (_pmc_url(sid) if sid.startswith("PMC") else f"#src-{sid.lower()}")
        title = (c.get("title") or "").replace('"', "'").strip()
        return f'[{sid}]({url} "{title[:140]}")' if title else f"[{sid}]({url})"

    def repl(m):
        return "[" + ", ".join(one(s) for s in re.split(r"\s*[,;]\s*", m.group(1))) + "]"

    return _CITE_GROUP.sub(repl, text or "")


def render_sources(ev: dict, answer_text: str = ""):
    """Sources under an answer. The ids the answer actually cites come first and open (in citation
    order, whatever tier they are from); everything else retrieved sits folded under it. Before
    this the cited papers hid under a collapsed expander while uncited notes stood open on top."""
    cards = _source_cards(ev)
    if not cards:
        return
    ui.section_heading(L["sources_h"], len(cards))
    with st.expander(L["legend_h"]):
        st.markdown(L["legend"])
    cited = _cited_ids(answer_text)
    if not cited:
        _render_tiers(ev)
        return
    shown = []
    for sid in cited:
        c = cards.get(sid)
        if c is None:                       # the model cited an id that was never retrieved
            c = {"id": sid, "title": L["src_unknown"], "kind": L["unknown_kind"], "chips": [],
                 "excerpt": "", "missing": True,
                 "link_label": L["open_pmc"] if sid.startswith("PMC") else "",
                 "url": _pmc_url(sid) if sid.startswith("PMC") else None}
        shown.append(c)
    with st.expander(L["src_cited"].format(n=len(shown)), expanded=True):
        ui.source_grid(shown)
    rest = [c for sid, c in cards.items() if sid not in set(cited)]
    if rest:
        with st.expander(L["src_more"].format(n=len(rest))):
            ui.source_grid(rest)


def _render_tiers(ev: dict):
    """Fallback grouping by tier when an answer carries no citation ids at all."""
    cards = _source_cards(ev)
    notes = ([cards["PHASE"]] if "PHASE" in cards else []) + [cards[n["id"]] for n in ev.get("notes", [])]
    papers = [cards[e["id"]] for e in ev.get("papers", [])]
    webs = [cards[w["id"]] for w in ev.get("web", [])]
    if notes:
        with st.expander(L["src_notes"].format(n=len(notes)), expanded=True):
            ui.source_grid(notes)
    if papers:
        with st.expander(L["src_papers"].format(n=len(papers)), expanded=not notes):
            ui.source_grid(papers)
    if webs:
        with st.expander(L["src_web"].format(n=len(webs)), expanded=True):
            ui.source_grid(webs)


def render_calls(calls: list[dict]):
    if not calls:
        return
    parts = [f"{c['label']} · {c['purpose']} · {c['seconds']}s" + (f" · {L['reasoning']}" if c["think"] else "")
             for c in calls]
    ui.calls_footer(L["behind"], parts, L["via"])


def empty_state(key: str, img: str, text: str):
    # Images are inlined as data URIs on purpose: st.image() serves files through Streamlit's
    # /media/<hash> endpoint, which came back broken on Streamlit Cloud (every mascot showed
    # as a broken-image icon). An inline <img> has nothing to fetch.
    with st.container(key=f"empty-{key}"):
        c_img, c_txt = st.columns([1, 5], vertical_alignment="center")
        c_img.html(ui.inline_img(img, 150))
        c_txt.markdown(text)


def _res_key(key: str) -> str:
    """Results are stored per interface language, so switching EN↔RU never shows an answer
    produced in the other language (the owner saw a Russian answer under the English UI)."""
    return f"{key}_{st.session_state['lang']}"


def show_result(key: str, img: str = "", text: str = ""):
    res = st.session_state.get(_res_key(key))
    if not res:
        if img:
            empty_state(key, img, text)
        return
    with st.container(key=f"card-answer-{key}", border=True):
        if res.get("source") == "web":
            st.info(L["web_info"])
        elif res.get("source") == "library+web":
            st.info(L["web_add_info"])
        st.markdown(link_citations(res["answer"], res.get("evidence", {})))
    render_sources(res.get("evidence", {}), res["answer"])
    render_calls(res.get("calls", []))


def run(key: str, fn, *args, **kwargs):
    if not llm.configured():
        st.error(L["no_key"])
        return
    with st.spinner(L["spinner"], show_time=True):
        try:
            st.session_state[_res_key(key)] = fn(*args, **kwargs)
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
    sex = st.selectbox(L["sex"], list(L["sex_opts"]), format_func=lambda k: L["sex_opts"][k],
                       help=L["profile_help"])
    age_band = st.selectbox(L["age"], list(L["age_opts"]), format_func=lambda k: L["age_opts"][k])
    revision = st.toggle(L["revision"], value=False, help=L["revision_help"])
    poor_perf = st.toggle(L["perfusion"], value=False, help=L["perfusion_help"])
    profile = Profile(surgery=surgery, surgery_date=surgery_date, sex=sex, age_band=age_band,
                      revision=revision, poor_perfusion=poor_perf)
    if surgery_date is None:
        ui.profile_hint(L["hint_date"])
    if sex == "na" and age_band == "na" and not revision and not poor_perf:
        ui.profile_hint(L["hint_optional"], muted=True)
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
            st.html(ui.inline_img(f"anatomy/{img}", None, caption=cap))
        st.caption(L["anat_credit"])
    st.divider()
    st.subheader(L["answers"])
    depth = st.segmented_control(L["depth"], L["depth_short_opts"], default=L["depth_short_opts"][0],
                                 help=L["depth_help"], width="stretch")
    tier = "deep" if depth == L["depth_short_opts"][1] else "strong"
    _web_opts = L["web_mode_opts"] if web.available() else [L["web_mode_opts"][2]]
    _web_pick = st.segmented_control(L["web_mode"], _web_opts, default=_web_opts[0],
                                     disabled=not web.available(), help=L["web_mode_help"], width="stretch")
    # Default "always add" (owner, 2026-11-06): every answer shows web sources next to the
    # library; endpoint/web.py caps the day so the free Tavily plan cannot be drained.
    web_mode = {L["web_mode_opts"][0]: "always", L["web_mode_opts"][1]: "silent",
                L["web_mode_opts"][2]: "off"}.get(_web_pick, "always")
    try:
        with st.spinner(L["lib_loading"], show_time=True), LIBRARY_LOCK:
            _tags = rag.all_tags()  # first call loads the index; later sessions wait, then hit the cache
    except Exception as exc:
        st.error(L["lib_error"].format(e=type(exc).__name__))
        st.stop()
    # One topic at a time (owner, 2026-10-30): a single choice reads clearer than a multi-filter.
    _tag = st.selectbox(L["tags"], [None] + list(_tags), format_func=lambda x: L["tags_all"] if x is None else tag_name(x))
    sel_tags = [_tag] if _tag else []
    # The daily token budget is an operator detail: visitors only see a warning once it is
    # nearly spent (so a pause at 100% isn't a surprise), never the running percentage.
    u = llm.usage_today()
    if u["budget"] and u["fraction"] >= 0.8:
        st.warning(L["budget_warn"])
    st.divider()
    try:
        stats = rag.stats()
        st.caption(L["lib_caption"].format(p=stats["papers"], c=stats["paper_chunks"], n=stats["notes"]))
    except Exception as exc:
        stats = None
        st.caption(L["lib_error"].format(e=type(exc).__name__))

# ----------------------------------------------------------------- header
_t_txt, _t_lang = st.columns([8, 2], vertical_alignment="center")
with _t_txt:
    ui.hero(L["eyebrow"], "Rehab Copilot", "capy_frog.png")


def _switch_lang():
    choice = st.session_state.get("lang_pick")
    if choice in ("en", "ru"):
        st.session_state["lang"] = choice
        for k in ("ask_q", "preset_pick", "cmp_a", "cmp_b", "doc_topic"):
            st.session_state.pop(k, None)


with _t_lang:
    # One joined EN | RU switch with flags (ui.CSS `.st-key-langsw`): it never wraps into two
    # stacked pills on narrow screens, and the flags come from inline SVG, not emoji.
    with st.container(key="langsw"):
        st.segmented_control(L["lang_label"], ["en", "ru"], key="lang_pick",
                             format_func=lambda k: "EN" if k == "en" else "RU",
                             default=st.session_state["lang"], on_change=_switch_lang,
                             label_visibility="collapsed", width="content")

ui.subtitle(L["subtitle"])
ui.note(L["disclaimer"])

# ----------------------------------------------------------------- your week, at a glance
if profile.phase:
    p = profile.phase
    pname, pfocus = phase_text(p["name"], p["focus"])
    tiles = [
        {"k": L["stat_week"], "v": profile.weeks, "s": f"~{profile.months} {L['months']} {L['stat_since']}", "accent": True},
        {"k": L["stat_phase"], "v": pname, "size": "sm",
         "s": f"{L['weeks']} {p['start']}{'+' if p['end'] is None else '–' + str(p['end'])} · {L['phase_hint']}"},
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
        run("ask_res", rag.answer, q, profile, tags=sel_tags or None, tier=tier, web_mode=web_mode, lang=UI_LANG)
    show_result("ask_res", "capy_king.png", L["ask_empty"])

# ----------------------------------------------------------------- Today
with tab_today:
    with st.container(key="card-today", border=True):
        with st.container(key="lead-today"):
            st.markdown(L["today_intro"])
        constraints = st.text_input(L["constraints"], placeholder=L["constraints_ph"], max_chars=200)
        if profile.weeks is None:
            st.info(L["need_date"])
        go = st.button(L["today_btn"], type="primary", disabled=profile.weeks is None, icon=":material/wb_sunny:")
    if go:
        run("today_res", rag.routine, profile, UI_LANG, constraints)
    show_result("today_res", "sun.png", L["today_empty"])

# ----------------------------------------------------------------- Compare
with tab_cmp:
    with st.container(key="card-cmp", border=True):
        with st.container(key="lead-cmp"):
            st.markdown(L["cmp_intro"])
        c1, c2 = st.columns(2, gap="medium")
        a = c1.text_input(L["cmp_a"], L["cmp_a_def"], key=f"cmp_a_{st.session_state['lang']}", max_chars=200)
        b = c2.text_input(L["cmp_b"], L["cmp_b_def"], key=f"cmp_b_{st.session_state['lang']}", max_chars=200)
        go = st.button(L["cmp_btn"], type="primary", icon=":material/compare_arrows:")
    if go:
        run("cmp_res", rag.compare, a, b, tier=tier, lang=UI_LANG)
    show_result("cmp_res", "pebble.png", L["cmp_empty"])

# ----------------------------------------------------------------- Doctor
with tab_doc:
    with st.container(key="card-doc", border=True):
        with st.container(key="lead-doc"):
            st.markdown(L["doc_intro"])
        topic = st.text_input(L["topic"], L["topic_def"], key=f"doc_topic_{st.session_state['lang']}", max_chars=200)
        go = st.button(L["doc_btn"], type="primary", icon=":material/stethoscope:")
    if go:
        run("doc_res", rag.specialist_questions, topic, profile, lang=UI_LANG)
    show_result("doc_res", "capy_frog.png", L["doc_empty"])

# ----------------------------------------------------------------- Telegram companion (page footer)
ui.telegram_card(TELEGRAM_BOT_URL, L["tg_title"], L["tg_body"], L["tg_open"])
