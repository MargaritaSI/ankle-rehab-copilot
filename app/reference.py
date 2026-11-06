# -*- coding: utf-8 -*-
"""
Static reference tab: which curated notes / papers back each entry.

No model call, no embeddings, no index: the notes are read straight from corpus/kb/*.json and
resolved by CONTENT (file + title fragment + a text fingerprint), so the KB lint that removes or
re-orders chunks never silently points an entry at a different note. A reference that no longer
resolves is dropped from the citations (and listed by `unresolved()` for the test).

The texts shown on the tab live in i18n.py (T[lang]["ref_items"], "ref_phase_lines",
"ref_plate"); this module only says WHAT is cited and in which order.
"""
from __future__ import annotations

import json
import pathlib

import streamlit as st

ROOT = pathlib.Path(__file__).resolve().parent.parent
KB_DIR = ROOT / "corpus" / "kb"

try:  # facet names come from the curated tier itself (endpoint/kb.py, endpoint/rag.py)
    import kb as _kb
    import rag as _rag
    _FACETS = _kb.FACETS
    _FACET_RU = _rag._FACET_RU
    _excerpt = _rag._excerpt
except Exception:  # pragma: no cover — only when run outside the app without the endpoint path
    _kb = None
    _FACETS, _FACET_RU = {}, {}

    def _excerpt(text: str, words: int = 60, min_words: int = 18) -> str:
        toks = text.split()
        return " ".join(toks[:words]) + (" …" if len(toks) > words else "")


# ------------------------------------------------------------------ note references
# key → (file stem, fragment of source_title, fragment of text).  The text fragment must be
# unique inside that source (paper chunks share one title).
NOTES: dict[str, tuple[str, str, str]] = {
    # micro-movement routine
    "m_principle": ("micro_movement_routine", "Главный принцип", "каждый час по 5 минут"),
    "m_lying": ("micro_movement_routine", "Упражнения лёжа", "L1 Ягодицы"),
    "m_sitting": ("micro_movement_routine", "Упражнения сидя", "S6 Икры сидя"),
    "m_nofocus": ("micro_movement_routine", "без фокуса", "резинку-эспандер на ногу НЕ использовать"),
    "m_standing": ("micro_movement_routine", "Упражнения стоя", "ST2"),
    "m_walk": ("micro_movement_routine", "Активная ходьба", "Шаг от ягодицы"),
    "m_walkmode": ("micro_movement_routine", "Интервальный режим", "1 минута активные ягодицы"),
    "m_rehab": ("micro_movement_routine", "безопасные движения для голеностопа", "R3 Стопа круг"),
    "m_notnow": ("micro_movement_routine", "что НЕ делать сейчас", "около 2 часов ходьбы"),
    "m_quad": ("micro_movement_routine", "Квадрицепс: варианты", "Толкни колено вниз"),
    "m_glute": ("micro_movement_routine", "Ягодицы не вставая", "Пульс ягодиц"),
    "m_ankle5": ("micro_movement_routine", "пять мягких движений", "Пауза в натяжении"),
    "m_sit_sit": ("micro_movement_routine", "Ситуации сидя", "За ноутом"),
    "m_sit_stand": ("micro_movement_routine", "Ситуации стоя", "Чистишь зубы"),
    "m_sit_lie": ("micro_movement_routine", "Ситуации лёжа", "Лежишь утром в кровати"),
    # extended_kb — exercise notes
    "x_safe_ankle": ("extended_kb", "Безопасные упражнения для голеностопа", "Изометрическое напряжение: слегка упритесь"),
    "x_calf_foot": ("extended_kb", "Укрепление икр и мышц стопы", "поджимайте пальцы"),
    "x_donor": ("extended_kb", "Бережные упражнения для донорского колена", "Скольжение пяткой"),
    "x_balance": ("extended_kb", "Баланс и устойчивость на одной ноге", "Подъёмы на носки двумя ногами с опорой на стул"),
    "x_core": ("extended_kb", "Пресс и кор без нагрузки", "Избегайте ягодичного мостика"),
    "x_posture": ("extended_kb", "Осанка: простые упражнения", "скользите пяткой"),
    "x_stretch": ("extended_kb", "Растяжка и подвижность голеностопа", "«помпа» голеностопом"),
    "x_glutes": ("extended_kb", "Ягодицы и бёдра", "Боковые подъёмы ноги лёжа"),
    "x_cardio": ("extended_kb", "Велотренажёр, плавание, эллипс", "Сигналы тревоги"),
    "x_notdo": ("extended_kb", "Чего НЕ делать", "рисование стопой букв алфавита"),
    "x_overload": ("extended_kb", "нагрузка чрезмерна", "не спадает за час"),
    "x_walking": ("extended_kb", "Ходьба как тренировка", "3–5 минут медленной ходьбы"),
    "x_mini15": ("extended_kb", "мини-программа", "Движения стопой по типу «алфавит»"),
    # extended_kb — nutrition notes
    "x_omega": ("extended_kb", "Омега-3 и жирная рыба", "2–3 такие порции в неделю"),
    "x_sugar": ("extended_kb", "Сахар и сладкое", "25–50 грамм в день"),
    "x_upf": ("extended_kb", "Ультрапереработанная еда", "1,2–1,5 г на килограмм"),
    "x_antiinf": ("extended_kb", "Противовоспалительные продукты", "олеокантал"),
    "x_fiber": ("extended_kb", "Клетчатка и овощи", "половину тарелки"),
    "x_day": ("extended_kb", "Простой день питания", "запечённый лосось"),
    "x_coffee": ("extended_kb", "Кофе и алкоголь", "остеобластов"),
    # extended_kb2 — phase notes and single exercises
    "y_p0": ("extended_kb2", "0–2 недели", "сгибание‑разгибание до 90°"),
    "y_p1": ("extended_kb2", "2–6 недель", "«рисование» пальцами в воздухе"),
    "y_p2": ("extended_kb2", "6–12 недель", "наклонитесь к стене"),
    "y_p3": ("extended_kb2", "3–6 месяцев", "«рисуя» цифры"),
    "y_p4": ("extended_kb2", "6–12 месяцев", "«пяточные подъемы» в положении сидя"),
    "y_cane": ("extended_kb2", "отказаться от трости", "трость уже не нужна"),
    "y_quadiso": ("extended_kb2", "Изометрия квадрицепса", "вытолкнуть пятку вперёд"),
    "y_slr": ("extended_kb2", "Подъём прямой ноги лёжа", "70‑80°"),
    "y_bridge": ("extended_kb2", "Ягодичный мостик", "прямую линию от плеч до колен"),
    "y_abd": ("extended_kb2", "Отведение бедра лёжа на боку", "боковой части бедра"),
    "y_band": ("extended_kb2", "с лентой", "пару‑три секунды"),
    "y_shift": ("extended_kb2", "Перенос веса тела стоя", "только пятку"),
    "y_wallsquat": ("extended_kb2", "Полуприсед у стены", "спиной к стене"),
    "y_balance": ("extended_kb2", "Баланс на одной ноге у опоры", "складка полотенца"),
    "y_towel": ("extended_kb2", "Растяжка икроножной мышцы полотенцем", "вокруг середины стопы"),
    "y_plank": ("extended_kb2", "Планка на коленях", "Встаньте на колени"),
    "y_breath": ("extended_kb2", "Диафрагмальное дыхание", "живот поднимается под рукой"),
    "y_salmon": ("extended_kb2", "Лосось и жирная рыба", "примерно ладонь"),
    "y_legumes": ("extended_kb2", "Бобовые", "Одна небольшая горсть"),
    "y_berries": ("extended_kb2", "Ягоды: антиоксиданты", "2‑3 порции в день"),
    "y_evoo": ("extended_kb2", "Оливковое масло extra virgin", "полифенолами"),
    "y_grains": ("extended_kb2", "Цельные злаки", "коричневый рис"),
    "y_nuts": ("extended_kb2", "Орехи и семена", "тыквенные семечки, подсолнечник"),
    # scenario forecasts
    "s_run": ("scenarios_predictions", "Бег и прыжки", "НЕ ДЕЛАТЬ в первые 6 месяцев"),
    "s_lowimpact": ("scenarios_predictions", "Низкоударные тренировки", "эффект смазки"),
    "s_rom": ("scenarios_predictions", "объём движений", "с помощью полотенца"),
    "s_calfstrength": ("scenarios_predictions", "Силовые на икры", "задняя большеберцовая, малоберцовые, камбаловидная"),
    "s_diet": ("scenarios_predictions", "Противовоспалительный протокол питания", "ложное чувство безопасности"),
    "s_donor": ("scenarios_predictions", "Бережная нагрузка на донорское колено", "скольжение пяткой по стене"),
    "s_calfraise": ("scenarios_predictions", "Подъёмы на носки", "12–16 недель"),
    "s_balance": ("scenarios_predictions", "Тренировка баланса", "8–10 недель"),
    "s_band": ("scenarios_predictions", "эластичной лентой", "не ранее 12 недель"),
    "s_gym": ("scenarios_predictions", "силовым тренировкам", "жим ногами с минимальным весом"),
    "s_curcumin": ("scenarios_predictions", "Куркумин", "щепоткой черного перца"),
    "s_sugar": ("scenarios_predictions", "Избыток сахара", "AGEs"),
    "s_ice": ("scenarios_predictions", "лёд и возвышение", "раз в 1,5–2 часа"),
    "s_vitc": ("scenarios_predictions", "Высокие дозы омега-3", "2–3 раза в неделю"),
    # FAQ best-of
    "f_squat": ("faq_bestof", "приседать на 5 месяце", "2 баллов из 10"),
    "f_run": ("faq_bestof", "начинать бегать", "30–60 секунд бега"),
    "f_overload": ("faq_bestof", "перегружаю ногу", "15–20 минут отдыха"),
    "f_stairs": ("faq_bestof", "донорское колено при спуске", "15–20 градусов"),
    "f_sport": ("faq_bestof", "Какой спорт", "аквааэробика"),
}

# ------------------------------------------------------------------ paper references
# Static cards for the open-access papers cited on the tab.  Excerpts are copied verbatim from
# the indexed chunks (corpus/index) or the curated chunks of the same paper, so the card shows the
# sentence the entry rests on, without loading the 250 MB index.
PAPERS: dict[str, dict] = {
    "PMC11200487": {
        "title": "A New Approach to Postoperative Rehabilitation following Mosaicplasty and Bone Marrow Aspiration Concentrate (BMAC) Augmentation",
        "year": "2024", "tags": ["rehab"],
        "excerpt": ("The initial phase, occurring within the first 7 days post-surgery, emphasizes pain management, joint mobility "
                    "restoration, and muscle tone improvement, while minimizing stress on the implant site to prevent complications, "
                    "employing cryotherapy, a controlled range of motion exercises, and partial weight-bearing education as crucial "
                    "components. […] initiate sports such as swimming and biking (without resistance) after 6 weeks, and incorporate "
                    "low-impact activities for 3 months while gradually reintroducing high-impact activities over a period exceeding 12 months.")},
    "PMC7049595": {
        "title": "OAT (mosaicplasty) for osteochondral lesions of the talus",
        "year": "2020", "tags": ["rehab", "surgery"],
        "excerpt": ("[…] passive range of motion exercises of the ankle and knee started. Patients were kept non-weight bearing for 12 weeks. "
                    "After radiographs showed evidence of bone healing, full weight bearing started. Patients were allowed to return to "
                    "sports after 6 months.")},
    "PMC9413343": {
        "title": "Omega-3 fatty acids for osteoarthritis — narrative review",
        "year": "2022", "tags": ["nutrition", "inflammation"],
        "excerpt": ("Omega-3 PUFAs are recognized for their anti-inflammatory properties, which could be beneficial in the context of OA to "
                    "moderate pro-inflammatory markers and cartilage loss. […] Although generally determined to be safe and tolerated, "
                    "omega-3 fatty acid supplements may exacerbate bleeding and anticoagulation in individuals consuming anticoagulants.")},
    "PMC13084561": {
        "title": "Omega-3 PUFAs in musculoskeletal health and sports medicine: from molecular pathways to precision nutrition strategies",
        "year": "2026", "tags": ["nutrition"],
        "excerpt": ("To maintain health, the World Health Organization recommends a daily intake of 0.25–2 grams of EPA + DHA for adults. "
                    "Key practical approaches include consuming 2–3 servings (approximately 100–150 grams per serving) of oily fish per "
                    "week; using vegetable oils rich in alpha-linolenic acid (ALA), such as canola oil; and moderately consuming walnuts "
                    "and flaxseeds to increase ALA intake.")},
    "PMC12157890": {
        "title": "Diet in Knee Osteoarthritis — Myths and Facts",
        "year": "2025", "tags": ["nutrition", "inflammation"],
        "excerpt": ("Recent data highlight the detrimental effects of high-carbohydrate and high-fat diets, particularly those rich in refined "
                    "sugars and saturated fats, which exacerbate systemic inflammation and contribute to cartilage degradation. Conversely, "
                    "diets rich in omega-3 fatty acids, polyphenols, and dietary fiber have shown anti-inflammatory and chondroprotective "
                    "properties. […] The sources of healthy carbohydrates, such as fruits, vegetables, and whole grains, provide nutritional "
                    "benefits without triggering inflammation, while refined sugars and processed foods should be avoided.")},
    "PMC11174396": {
        "title": "Omega-3 Supplementation and Its Effects on Osteoarthritis",
        "year": "2024", "tags": ["nutrition", "inflammation"],
        "excerpt": ("[…] the Mediterranean diet emphasizes fruit and vegetables, whole grains, and healthy fats (omega-3 sources of olive oil, "
                    "nuts, fatty fish, and low-fat dairy) and has been shown to reduce the prevalence of OA in some individuals. […] "
                    "Research has evaluated if omega-3 and/or curcumin could be used as a substitute treatment method for OA, and fish "
                    "oil was found to be superior to curcumin both alone and in combination.")},
    "PMC12844890": {
        "title": "Nutritional Interventions in Osteoarthritis: Mechanisms, Clinical Evidence, and Translational Opportunities",
        "year": "2026", "tags": ["nutrition"],
        "excerpt": ("Whole-diet approaches, such as Mediterranean and plant-based, have been linked to reduced pain, increased physical "
                    "function, and positive biomarker changes. […] The Mediterranean diet is notable for incorporating foods such as fruits, "
                    "vegetables, legumes, white meat, dairy products, and olive oil, highlighting its efforts to reduce the consumption of "
                    "red meat and processed meat in consumers’ diets.")},
    "PMC13233388": {
        "title": "Efficacy and safety of different curcumin formulations in osteoarthritis: an umbrella review of systematic reviews",
        "year": "2026", "tags": ["inflammation"],
        "excerpt": ("Curcumin formulations exhibited significant improvements in pain (VAS) and joint function/stiffness (WOMAC), showing "
                    "efficacy signals comparable to non-steroidal anti-inflammatory drugs (NSAIDs) and a more favorable tolerability profile "
                    "in the available studies. However, methodological and clinical heterogeneity was substantial. […] the clinical "
                    "translation of native curcumin is constrained by intrinsic pharmacokinetic limitations, including poor aqueous "
                    "solubility, limited systemic bioavailability following oral administration, and rapid metabolic clearance.")},
    "PMC13518480": {
        "title": "Ultra-Processed Foods and Metabolic Dysfunction: Position Paper of the Italian Association of Dietetics and Clinical Nutrition (ADI)",
        "year": "2026", "tags": ["nutrition", "inflammation"],
        "excerpt": ("High UPFs consumption has been associated with obesity, insulin resistance, cardiovascular disease, metabolic "
                    "dysfunction-associated steatotic liver disease (MASLD), cancer, neuroinflammation […]. The high consumption of "
                    "ultra-processed foods (UPFs) containing refined ingredients, additives, emulsifiers, and artificial flavouring agents "
                    "lead to an increased intestinal permeability and dysbiosis.")},
}

# ------------------------------------------------------------------ section 1: exercises by phase
# phase name (endpoint/phase.py PHASES) → ordered item ids; each item → its sources (note keys and
# PMC ids), most specific first.  Texts: i18n T[lang]["ref_items"][item_id].
PHASE_ITEMS: dict[str, list[tuple[str, list[str]]]] = {
    "Protection": [
        ("p1_pump", ["y_p0", "x_safe_ankle", "s_ice", "s_calfraise", "PMC11200487"]),
        ("p1_toes", ["m_ankle5", "m_rehab", "s_ice", "x_notdo"]),
        ("p1_quad", ["m_quad", "y_quadiso", "s_donor", "y_p0"]),
        ("p1_slr", ["m_rehab", "y_slr", "s_donor"]),
        ("p1_glute", ["m_lying", "m_glute", "m_sit_lie"]),
    ],
    "Early motion": [
        ("p2_circles", ["m_ankle5", "y_p1", "x_mini15", "s_rom"]),
        ("p2_towel_rom", ["s_rom", "x_stretch"]),
        ("p2_calfiso", ["x_safe_ankle", "x_mini15", "s_calfstrength", "s_calfraise"]),
        ("p2_quad", ["m_quad", "x_donor", "y_quadiso"]),
        ("p2_heelslide", ["x_donor", "s_donor"]),
        ("p2_abd", ["y_abd", "x_glutes"]),
    ],
    "Progressive weight-bearing": [
        ("p3_shift", ["y_shift", "s_balance", "s_donor", "m_standing"]),
        ("p3_alphabet", ["s_calfstrength", "s_calfraise", "x_notdo"]),
        ("p3_towel", ["y_towel", "x_stretch", "x_notdo", "y_p2"]),
        ("p3_toes", ["x_calf_foot", "m_sitting", "m_sit_sit"]),
        ("p3_bridge", ["y_bridge", "x_glutes", "x_core"]),
        ("p3_plank", ["y_plank", "x_core"]),
    ],
    "Strength and control": [
        ("p4_band", ["s_band", "y_band", "m_nofocus", "m_notnow"]),
        ("p4_balance", ["s_balance", "y_balance", "x_balance", "m_standing"]),
        ("p4_seated_calf", ["s_calfstrength", "m_sitting"]),
        ("p4_calfraise2", ["x_balance", "s_calfraise", "m_standing"]),
        ("p4_wallsquat", ["y_wallsquat", "f_stairs", "s_donor"]),
        ("p4_abd_stand", ["m_standing", "m_sit_stand", "s_donor"]),
    ],
    "Impact preparation": [
        ("p5_squat", ["f_squat"]),
        ("p5_softmat", ["s_balance", "x_balance"]),
        ("p5_eyes", ["x_balance", "y_balance", "m_notnow"]),
        ("p5_glutewalk", ["m_walk", "m_walkmode", "x_walking"]),
        ("p5_stairs", ["f_stairs"]),
    ],
    "Return to sport": [
        ("p6_runwalk", ["f_run", "s_run"]),
        ("p6_squat_deeper", ["f_squat", "s_gym"]),
        ("p6_legpress", ["s_gym"]),
        ("p6_unstable", ["s_gym", "s_balance"]),
    ],
    "Long-term joint care": [
        ("p7_hourly", ["m_principle", "m_quad"]),
        ("p7_glutepulse", ["m_glute", "m_sit_stand"]),
        ("p7_ankle_reset", ["m_ankle5", "m_sit_sit"]),
        ("p7_calf_seated", ["m_sitting", "m_nofocus"]),
        ("p7_shift", ["m_standing", "x_posture"]),
        ("p7_stairs", ["f_stairs"]),
    ],
}

# Per-phase "also" and "not now" lines: text in i18n T[lang]["ref_phase_lines"][phase]; sources here.
PHASE_LINES: dict[str, dict[str, list[str]]] = {
    "Protection": {"also": ["s_ice", "y_p0", "PMC11200487"], "avoid": ["y_p0", "x_safe_ankle", "PMC7049595"]},
    "Early motion": {"also": ["y_p1", "s_rom"], "avoid": ["y_p1", "s_calfraise", "x_safe_ankle"]},
    "Progressive weight-bearing": {"also": ["x_walking", "y_cane", "x_cardio", "s_lowimpact", "PMC11200487"],
                                   "avoid": ["x_overload", "s_band", "s_donor"]},
    "Strength and control": {"also": ["x_cardio", "f_sport", "PMC11200487"], "avoid": ["x_notdo", "f_squat", "s_run"]},
    "Impact preparation": {"also": ["f_run", "s_run", "s_gym", "PMC7049595"], "avoid": ["x_cardio", "x_overload"]},
    "Return to sport": {"also": ["s_gym", "f_sport"], "avoid": ["s_gym", "f_run"]},
    "Long-term joint care": {"also": ["m_notnow", "x_overload", "f_sport"], "avoid": ["m_notnow"]},
}

# ------------------------------------------------------------------ section 2: the plate
# Each part → sources; texts in i18n T[lang]["ref_plate"].
PLATE_PARTS: list[tuple[str, list[str]]] = [
    ("half_veg", ["x_fiber", "x_antiinf", "y_berries", "s_sugar", "PMC12157890"]),
    ("quarter_protein", ["x_omega", "y_salmon", "x_upf", "PMC13084561", "PMC9413343", "PMC11174396"]),
    ("quarter_grains", ["y_grains", "y_legumes", "x_fiber", "PMC12844890"]),
    ("plus_oil", ["x_antiinf", "y_evoo", "PMC12157890", "PMC11174396"]),
    ("plus_turmeric", ["x_antiinf", "s_curcumin", "PMC13233388", "PMC11174396"]),
    ("plus_nuts_water", ["y_nuts", "s_ice", "y_p2"]),
    ("limit", ["x_sugar", "x_upf", "s_sugar", "s_ice", "x_omega", "x_coffee", "PMC13518480", "PMC12157890"]),
    ("caveat", ["s_diet", "x_omega", "PMC9413343"]),
    ("day", ["x_day"]),
]


# ------------------------------------------------------------------ resolution
def _fingerprint() -> str:
    return "|".join(f"{f.name}:{f.stat().st_size}:{int(f.stat().st_mtime)}" for f in sorted(KB_DIR.glob("*.json")))


@st.cache_data(show_spinner=False)
def _all_notes(fp: str) -> list[dict]:
    out = []
    for f in sorted(KB_DIR.glob("*.json")):
        try:
            chunks = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        for c in chunks:
            text = (c.get("text") or "").strip()
            if len(text) < 40:
                continue
            kind = _kb.note_kind(c, f.stem) if hasattr(_kb, "note_kind") else ""   # same label as the answers
            out.append({"text": text, "title": c.get("source_title") or f.stem, "url": c.get("source_url") or "",
                        "topic": c.get("topic") or f.stem, "facet": _FACETS.get(f.stem, f.stem), "file": f.stem,
                        "kind": kind})
    return out


def resolve(key: str) -> dict | None:
    """The note a key points at, or None when the KB no longer holds it."""
    file, title_sub, text_sub = NOTES[key]
    for n in _all_notes(_fingerprint()):
        if n["file"] == file and title_sub in n["title"] and text_sub in n["text"]:
            return n
    return None


def unresolved() -> list[str]:
    return [k for k in NOTES if resolve(k) is None]


def build_evidence(groups: list[list[str]], start: int = 1) -> tuple[dict, list[list[str]], int]:
    """groups: per entry, its source keys (note keys and PMC ids) → (evidence dict for
    app.render_sources, per-entry display ids in order, next free KB number).
    Notes are numbered KB-{start}… in order of first citation; papers keep their PMC id."""
    notes: list[dict] = []
    papers: list[dict] = []
    kb_ids: dict[str, str] = {}
    seen_papers: set[str] = set()
    cites: list[list[str]] = []
    n = start
    for keys in groups:
        ids: list[str] = []
        for k in keys:
            if k.startswith("PMC"):
                if k not in PAPERS:
                    continue
                if k not in seen_papers:
                    seen_papers.add(k)
                    p = PAPERS[k]
                    papers.append({"id": k, "title": p["title"], "year": p["year"], "tags": p["tags"],
                                   "excerpt": p["excerpt"], "url": f"https://pmc.ncbi.nlm.nih.gov/articles/{k}/"})
                ids.append(k)
                continue
            if k not in kb_ids:
                note = resolve(k)
                if note is None:
                    continue
                kb_ids[k] = f"KB-{n}"
                n += 1
                notes.append({"id": kb_ids[k], "title": note["title"], "facet": note["facet"], "url": note["url"],
                              "file": note["file"], "topic": note["topic"], "kind": note.get("kind", ""),
                              "excerpt": _excerpt(note["text"]),
                              "text": note["text"], "facet_ru": _FACET_RU.get(note["facet"], note["facet"]), "score": 1.0})
            ids.append(kb_ids[k])
        cites.append(ids)
    return {"notes": notes, "papers": papers, "web": []}, cites, n


def cite_text(cites: list[list[str]]) -> str:
    """A pseudo-answer that cites every id in order, so render_sources shows them as 'cited'."""
    seen, out = set(), []
    for ids in cites:
        for i in ids:
            if i not in seen:
                seen.add(i)
                out.append(f"[{i}]")
    return " ".join(out)
