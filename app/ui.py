# -*- coding: utf-8 -*-
"""
Design system for the Streamlit UI — global CSS + small HTML building blocks.

Everything visual lives here so app.py stays about flow. The palette and type
scale mirror .streamlit/config.toml (Streamlit theme) — re-tune both together.

Type: Manrope (700/800 for headings, 500/600 for body), base 17px.
Surfaces: warm ivory page, near-white cards, one deep-teal accent, caramel
for the "now" marker (borrowed from the capybara).
"""
from __future__ import annotations

import base64
import html as _html
import pathlib
import re

import streamlit as st

ASSETS = pathlib.Path(__file__).resolve().parent / "assets"

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap');

:root{
  --ink:#1B1F1E; --ink-2:#48504C; --muted:#7A827C;
  --paper:#F7F3EC; --card:#FFFDF9; --card-2:#F1ECE2; --line:#E6E0D4;
  --teal:#2F6F6D; --teal-deep:#23504E; --teal-soft:#D7E8E4; --teal-wash:#EDF4F2;
  --caramel:#D08A4E; --sand:#F5EFE3; --sand-line:#E9DFC8;
  --shadow:0 1px 2px rgba(27,31,30,.04), 0 14px 34px -18px rgba(27,31,30,.20);
  --r-lg:24px; --r-md:18px; --r-sm:12px;
}

html, body, .stApp, [data-testid="stAppViewContainer"]{
  font-family:'Manrope', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
h1,h2,h3,h4{letter-spacing:-.02em;}

/* ---------- layout */
[data-testid="stMainBlockContainer"]{padding-top:3.4rem; padding-bottom:6rem; max-width:1260px;}
section[data-testid="stSidebar"]{width:376px !important; min-width:376px !important;}
[data-testid="stSidebarUserContent"]{padding:1.1rem 1.4rem 2.5rem;}
[data-testid="stSidebar"] hr{margin:1.2rem 0;}
.stMarkdown p, .stMarkdown li{font-size:1.04rem; line-height:1.7;}
[data-testid="stWidgetLabel"] p{font-size:.98rem; font-weight:700; color:var(--ink-2);}
[data-testid="stCaptionContainer"] p{font-size:.9rem; line-height:1.5;}
[data-testid="stAlert"]{border-radius:var(--r-md);}
[data-testid="stAlert"] p{font-size:1rem; line-height:1.55;}
[data-testid="stSpinner"] p{font-size:1.02rem; font-weight:600; color:var(--ink-2);}

/* ---------- tabs → big pills */
[data-baseweb="tab-list"]{gap:6px; padding:6px; background:var(--card-2); border-radius:999px;
  width:max-content; max-width:100%; overflow-x:auto; margin:.6rem 0 .2rem;}
[data-baseweb="tab-highlight"], [data-baseweb="tab-border"]{display:none !important;}
button[data-baseweb="tab"]{height:50px; padding:0 24px; border-radius:999px; background:transparent;
  transition:background .15s ease, box-shadow .15s ease;}
button[data-baseweb="tab"] p{font-size:1.02rem; font-weight:700; color:var(--ink-2); white-space:nowrap;}
button[data-baseweb="tab"]:hover{background:rgba(255,253,249,.7);}
button[data-baseweb="tab"][aria-selected="true"]{background:var(--card); box-shadow:var(--shadow);}
button[data-baseweb="tab"][aria-selected="true"] p{color:var(--teal);}
[data-baseweb="tab-panel"]{padding-top:1.4rem !important;}

/* ---------- buttons */
.stButton > button, [data-testid="stBaseButton-primary"], [data-testid="stBaseButton-secondary"]{
  min-height:56px; padding:0 28px; font-weight:800; font-size:1.04rem; letter-spacing:.005em;
  transition:transform .12s ease, box-shadow .15s ease;}
.stButton > button[kind="primary"]{min-width:200px; box-shadow:0 12px 26px -12px rgba(47,111,109,.65);}
.stButton > button[kind="primary"]:hover:not(:disabled){transform:translateY(-1px);
  box-shadow:0 16px 30px -12px rgba(47,111,109,.7);}
.stButton > button:disabled{opacity:.45;}

/* ---------- pills / segmented (both render as [data-testid="stButtonGroup"]) */
[data-testid="stButtonGroup"] button[kind^="pills"]{
  border-radius:999px; min-height:44px; padding:0 18px; border:1.5px solid var(--line);
  background:var(--card); transition:all .12s ease;}
[data-testid="stButtonGroup"] button[kind^="pills"] p{font-size:.96rem; font-weight:700; color:var(--ink-2);}
[data-testid="stButtonGroup"] button[kind="pills"]:hover{border-color:var(--teal); background:var(--teal-wash);}
[data-testid="stButtonGroup"] button[kind="pillsActive"]{background:var(--teal) !important; border-color:var(--teal) !important;}
[data-testid="stButtonGroup"] button[kind="pillsActive"] p{color:#fff !important;}
[data-testid="stButtonGroup"] button[kind^="segmented_control"]{min-height:44px; padding:0 20px; border-radius:999px;
  border:1.5px solid var(--line); background:var(--card); transition:all .12s ease;}
[data-testid="stButtonGroup"] button[kind^="segmented_control"] p{font-size:.96rem; font-weight:700; color:var(--ink-2);}
[data-testid="stButtonGroup"] button[kind="segmented_control"]:hover{border-color:var(--teal); background:var(--teal-wash);}
[data-testid="stButtonGroup"] button[kind="segmented_controlActive"]{background:var(--teal) !important; border-color:var(--teal) !important;}
[data-testid="stButtonGroup"] button[kind="segmented_controlActive"] p{color:#fff !important;}
[data-testid="stButtonGroup"] [data-baseweb="button-group"]{gap:6px; flex-wrap:wrap;}
[class*="st-key-lang_pick"]{margin-left:auto;}

/* ---------- inputs */
[data-testid="stTextArea"] textarea{font-size:1.12rem; line-height:1.6; padding:16px 18px; font-weight:500;}
[data-testid="stTextInput"] input{font-size:1.06rem; height:54px; padding:0 16px; font-weight:500;}
[data-testid="stDateInput"] input{font-size:1.02rem; height:50px; font-weight:600;}
[data-baseweb="select"] > div{min-height:50px; font-size:1rem; font-weight:600;}
[data-baseweb="select"] > div, [data-baseweb="base-input"], [data-baseweb="textarea"]{border-radius:14px;}
[data-testid="stToggle"] p{font-size:1rem; font-weight:600;}
[data-testid="stExpander"] details{border-radius:var(--r-md); background:var(--card);}
[data-testid="stExpander"] summary{padding:16px 18px;}
[data-testid="stExpander"] summary p{font-weight:700; font-size:1rem;}
[data-testid="stExpanderDetails"]{padding:4px 18px 18px;}
[data-testid="stHtml"]{line-height:1.5;}

/* ---------- cards built from st.container(key="card-…", border=True) */
[class*="st-key-card"]{background:var(--card); border-color:var(--line) !important; border-radius:var(--r-lg) !important;
  box-shadow:var(--shadow); padding:1.6rem 1.7rem !important;}
[class*="st-key-answer"] .stMarkdown p, [class*="st-key-answer"] .stMarkdown li{font-size:1.12rem; line-height:1.75;}
[class*="st-key-answer"] .stMarkdown h1, [class*="st-key-answer"] .stMarkdown h2{font-size:1.6rem; margin-top:1.2rem;}
[class*="st-key-answer"] .stMarkdown h3{font-size:1.3rem; margin-top:1rem;}
[class*="st-key-answer"] .stMarkdown table{font-size:1rem; border-collapse:separate; border-spacing:0; border:1px solid var(--line); border-radius:var(--r-sm); overflow:hidden;}
[class*="st-key-answer"] .stMarkdown th{background:var(--card-2); font-weight:800; padding:10px 12px;}
[class*="st-key-answer"] .stMarkdown td{padding:10px 12px; border-top:1px solid var(--line);}
[class*="st-key-lead"] .stMarkdown p{font-size:1.18rem; line-height:1.6; color:var(--ink-2); margin-bottom:.6rem;}
[class*="st-key-empty"]{background:var(--card-2); border:1.5px dashed var(--line) !important; border-radius:var(--r-lg) !important;
  padding:1.6rem 1.8rem !important;}
[class*="st-key-empty"] .stMarkdown p{font-size:1.22rem; line-height:1.55; color:var(--ink-2);}
[class*="st-key-empty"] img{filter:drop-shadow(0 10px 16px rgba(27,31,30,.14));}

/* ---------- hero */
.hero{display:flex; align-items:center; gap:20px;}
.hero img{height:88px; width:auto; flex:none; filter:drop-shadow(0 10px 16px rgba(27,31,30,.14));}
.hero .eyebrow{font-size:.8rem; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:var(--teal); margin-bottom:4px;}
.hero h1{margin:0; font-size:3.1rem; font-weight:800; letter-spacing:-.035em; line-height:1.02; color:var(--ink);}
.sub{font-size:1.24rem; line-height:1.55; color:var(--ink-2); max-width:860px; margin:1rem 0 1.1rem; font-weight:500;}
.sub em{font-style:normal; font-weight:800; color:var(--teal);}
.note{display:flex; gap:14px; align-items:flex-start; background:var(--sand); border:1px solid var(--sand-line);
  border-radius:var(--r-md); padding:14px 18px; color:#5B5346; font-size:.98rem; line-height:1.55; margin:0 0 1.6rem;}
.note b{color:#3E3729;}
.note .ic{flex:none; width:30px; height:30px; border-radius:10px; background:#EBDFC5; display:grid; place-items:center;
  font-weight:800; color:#7A6A47; font-size:.95rem;}

/* ---------- stat grid */
.grid{display:grid; grid-template-columns:1.2fr 1.15fr 1.6fr 1.15fr; gap:16px; margin:0 0 1.4rem;}
@media (max-width:1180px){.grid{grid-template-columns:repeat(2, minmax(0,1fr));}}
@media (max-width:600px){.grid{grid-template-columns:1fr;}}
.tile{background:var(--card); border:1px solid var(--line); border-radius:var(--r-lg); padding:22px 24px 20px;
  box-shadow:var(--shadow); min-height:156px; display:flex; flex-direction:column; justify-content:space-between;}
.tile.accent{background:linear-gradient(135deg,var(--teal) 0%,var(--teal-deep) 100%); border-color:transparent;}
.tile .k{font-size:.78rem; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--muted);}
.tile .v{font-size:2.9rem; font-weight:800; letter-spacing:-.035em; line-height:1; margin:12px 0 8px; color:var(--ink);}
.tile .v.sm{font-size:1.55rem; line-height:1.2; letter-spacing:-.02em;}
.tile .v.xs{font-size:1.04rem; line-height:1.5; font-weight:600; color:var(--ink-2); letter-spacing:0;}
.tile .s{font-size:.95rem; font-weight:600; color:var(--muted); line-height:1.4;}
.tile.accent .k{color:rgba(255,255,255,.72);} .tile.accent .v, .tile.accent .v.xs{color:#fff;} .tile.accent .s{color:rgba(255,255,255,.8);}

/* ---------- sidebar: header, phase card, timeline */
.sidehead{display:flex; align-items:center; gap:12px; margin:0 0 .6rem;}
.sidehead img{height:52px; width:auto;}
.sidehead h2{margin:0; font-size:1.5rem; font-weight:800; letter-spacing:-.02em;}
.pcard{background:linear-gradient(135deg,var(--teal) 0%,var(--teal-deep) 100%); color:#fff; border-radius:var(--r-lg);
  padding:20px 20px 18px; margin:.3rem 0 1rem; box-shadow:0 14px 30px -16px rgba(47,111,109,.6);}
.pcard .k{font-size:.76rem; font-weight:800; letter-spacing:.14em; text-transform:uppercase; opacity:.75;}
.pcard .v{font-size:2.6rem; font-weight:800; letter-spacing:-.035em; line-height:1; margin:8px 0 6px;}
.pcard .s{font-size:.95rem; font-weight:600; opacity:.85;}
.pcard .p{margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,.22); font-size:1.06rem; font-weight:800; line-height:1.3;}
.pcard .p span{opacity:.72; font-weight:600; font-size:.92rem;}
.pcard .f{font-size:.92rem; opacity:.88; line-height:1.5; margin-top:5px;}
.tlh{font-size:.78rem; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); margin:.9rem 0 .7rem;}
.tl{display:flex; flex-direction:column; margin:0 0 .4rem;}
.tl .row{display:grid; grid-template-columns:22px 1fr; gap:12px; position:relative; padding-bottom:16px;}
.tl .row:before{content:""; position:absolute; left:10px; top:20px; bottom:-2px; width:2px; background:var(--line);}
.tl .row:last-child:before{display:none;}
.tl .dot{width:22px; height:22px; border-radius:50%; border:2px solid var(--line); background:var(--card); position:relative; z-index:1;}
.tl .row.done .dot{background:var(--teal-soft); border-color:var(--teal-soft);}
.tl .row.done .dot:after{content:""; position:absolute; inset:6px; border-radius:50%; background:var(--teal);}
.tl .row.now .dot{background:var(--teal); border-color:var(--teal); box-shadow:0 0 0 5px var(--teal-soft);}
.tl .n{font-weight:800; font-size:.98rem; color:var(--ink); line-height:1.35;}
.tl .row.done .n, .tl .row.todo .n{color:var(--ink-2); font-weight:700;}
.tl .w{font-size:.8rem; font-weight:700; color:var(--muted); margin-left:6px; white-space:nowrap;}
.tl .f{font-size:.88rem; color:var(--muted); line-height:1.45; margin-top:2px;}
.tl .row.now .f{color:var(--ink-2);}
.tl .badge{display:inline-block; background:var(--caramel); color:#fff; font-size:.64rem; font-weight:800; letter-spacing:.12em;
  text-transform:uppercase; padding:2px 8px; border-radius:999px; margin-left:8px; vertical-align:2px;}

/* ---------- sources */
.sh{font-size:1.3rem; font-weight:800; letter-spacing:-.015em; margin:1.8rem 0 .7rem; color:var(--ink); display:flex; align-items:center; gap:10px;}
.sh .cnt{font-size:.8rem; font-weight:800; background:var(--teal-wash); color:var(--teal); padding:3px 10px; border-radius:999px;}
.srcgrid{display:grid; grid-template-columns:repeat(auto-fill, minmax(310px,1fr)); gap:14px; margin:.4rem 0 .2rem;}
.src{background:var(--card); border:1px solid var(--line); border-radius:var(--r-md); padding:16px 18px;
  display:flex; flex-direction:column; gap:8px; min-height:150px;}
.src .top{display:flex; align-items:center; gap:8px; flex-wrap:wrap;}
.src .id{font-weight:800; color:var(--teal); background:var(--teal-wash); border-radius:8px; padding:2px 9px; font-size:.86rem;}
.src .kind{font-size:.74rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--muted);}
.src .t{font-weight:700; font-size:1.02rem; line-height:1.4; color:var(--ink);}
.src .x{font-size:.94rem; line-height:1.55; color:var(--ink-2); display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden;}
.src .chips{display:flex; gap:6px; flex-wrap:wrap;}
.chip{display:inline-block; padding:3px 10px; border-radius:999px; border:1px solid var(--line); color:var(--muted);
  font-size:.78rem; font-weight:700; background:var(--card-2); line-height:1.4;}
.src a{font-weight:800; font-size:.92rem; color:var(--teal); text-decoration:none; margin-top:auto; padding-top:4px; overflow-wrap:anywhere;}
.src a:hover{text-decoration:underline;}
.calls{display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:1.1rem; color:var(--muted); font-size:.88rem; font-weight:600;}
.calls .chip{background:var(--card);}
.calls .lbl{font-weight:800; letter-spacing:.1em; text-transform:uppercase; font-size:.74rem; margin-right:4px;}

@media (max-width:700px){
  .hero img{height:62px;} .hero h1{font-size:2.2rem;}
  .sub{font-size:1.08rem;} .tile .v{font-size:2.2rem;}
  button[data-baseweb="tab"]{padding:0 16px; height:44px;}
  [class*="st-key-card"]{padding:1.1rem 1.1rem !important;}
}
"""


# ----------------------------------------------------------------- plumbing
def inject() -> None:
    st.html(f"<style>{CSS}</style>")


@st.cache_data(show_spinner=False)
def img_b64(name: str) -> str:
    return base64.b64encode((ASSETS / name).read_bytes()).decode()


def esc(s) -> str:
    return _html.escape(str(s if s is not None else ""), quote=True)


def md_inline(s: str) -> str:
    """The tiny subset of Markdown our UI strings use (**bold**, *em*) → HTML."""
    s = esc(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)
    return s


# ----------------------------------------------------------------- blocks
def hero(eyebrow: str, title: str, img: str) -> None:
    st.html(
        f"<div class='hero'><img src='data:image/png;base64,{img_b64(img)}' alt=''>"
        f"<div><div class='eyebrow'>{esc(eyebrow)}</div><h1>{esc(title)}</h1></div></div>")


def subtitle(text: str) -> None:
    st.html(f"<p class='sub'>{md_inline(text)}</p>")


def note(text: str) -> None:
    st.html(f"<div class='note'><div class='ic'>i</div><div>{md_inline(text)}</div></div>")


def stat_grid(tiles: list[dict]) -> None:
    """tiles: {k: label, v: value, size: ''|'sm'|'xs', s: sub, accent: bool}"""
    cells = []
    for t in tiles:
        size = f" {t['size']}" if t.get("size") else ""
        cls = "tile accent" if t.get("accent") else "tile"
        cells.append(
            f"<div class='{cls}'><div><div class='k'>{esc(t['k'])}</div>"
            f"<div class='v{size}'>{esc(t['v'])}</div></div><div class='s'>{esc(t.get('s', ''))}</div></div>")
    st.html(f"<div class='grid'>{''.join(cells)}</div>")


def side_header(title: str, img: str) -> None:
    st.html(f"<div class='sidehead'><img src='data:image/png;base64,{img_b64(img)}' alt=''><h2>{esc(title)}</h2></div>")


def phase_card(week_label: str, weeks: int, months_line: str, phase_name: str, weeks_line: str, focus: str) -> None:
    st.html(
        f"<div class='pcard'><div class='k'>{esc(week_label)}</div><div class='v'>{weeks}</div>"
        f"<div class='s'>{esc(months_line)}</div>"
        f"<div class='p'>{esc(phase_name)} <span>· {esc(weeks_line)}</span></div>"
        f"<div class='f'>{esc(focus)}</div></div>")


def timeline(rows: list[dict], heading: str, now_label: str) -> None:
    """rows: {name, focus, weeks: '12–26 wk', state: 'done'|'now'|'todo'}"""
    out = []
    for r in rows:
        badge = f"<span class='badge'>{esc(now_label)}</span>" if r["state"] == "now" else ""
        out.append(
            f"<div class='row {r['state']}'><div class='dot'></div><div>"
            f"<div class='n'>{esc(r['name'])}<span class='w'>{esc(r['weeks'])}</span>{badge}</div>"
            f"<div class='f'>{esc(r['focus'])}</div></div></div>")
    st.html(f"<div class='tlh'>{esc(heading)}</div><div class='tl'>{''.join(out)}</div>")


def section_heading(title: str, count: int | None = None) -> None:
    cnt = f"<span class='cnt'>{count}</span>" if count is not None else ""
    st.html(f"<div class='sh'>{esc(title)}{cnt}</div>")


def source_grid(cards: list[dict]) -> None:
    """cards: {id, title, kind, chips: [..], excerpt, link_label, url}"""
    out = []
    for c in cards:
        chips = "".join(f"<span class='chip'>{esc(x)}</span>" for x in c.get("chips", []) if x)
        chips = f"<div class='chips'>{chips}</div>" if chips else ""
        link = (f"<a href='{esc(c['url'])}' target='_blank' rel='noopener'>{esc(c['link_label'])}</a>"
                if c.get("url") else "")
        out.append(
            f"<div class='src'><div class='top'><span class='id'>[{esc(c['id'])}]</span>"
            f"<span class='kind'>{esc(c['kind'])}</span></div>"
            f"<div class='t'>{esc(c['title'])}</div><div class='x'>{esc(c['excerpt'])}</div>{chips}{link}</div>")
    st.html(f"<div class='srcgrid'>{''.join(out)}</div>")


def calls_footer(label: str, parts: list[str], via: str) -> None:
    chips = "".join(f"<span class='chip'>{esc(p)}</span>" for p in parts)
    st.html(f"<div class='calls'><span class='lbl'>{esc(label)}</span>{chips}<span>{esc(via)}</span></div>")
