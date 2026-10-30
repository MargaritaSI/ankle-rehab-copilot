# -*- coding: utf-8 -*-
"""
Recovery phase from the surgery date.

Typical windows across published OAT / mosaicplasty-of-the-talus protocols.
Protocols differ between clinics; the user's own surgeon's protocol always
overrides this table. The phase is only used as CONTEXT for the model so an
answer is anchored to where the person actually is.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

SURGERIES = {
    "talus_oat": "Talus OAT / mosaicplasty (osteochondral autograft, donor site: knee)",
    "talus_other": "Other talus cartilage repair (microfracture, ACI, allograft)",
    "other": "Other lower-limb surgery / not sure",
}

# (start_week, end_week or None, name, typical focus, typical cautions)
PHASES = [
    (0, 2, "Protection",
     "wound care, elevation and swelling control, ankle pumps, isometrics; usually non-weight-bearing",
     "no loading of the graft; donor knee: gentle range of motion only"),
    (2, 6, "Early motion",
     "range of motion without load, continuous passive motion if prescribed, partial weight-bearing only when the surgeon allows",
     "swelling after activity is common; impact and twisting are out"),
    (6, 12, "Progressive weight-bearing",
     "stepwise loading to full weight-bearing, gait re-education, calf / peroneal / hip strengthening, balance",
     "pain or swelling that lasts past the next morning means the step was too big"),
    (12, 26, "Strength and control",
     "single-leg balance, closed-chain strength, stationary bike, swimming; donor-knee quadriceps work",
     "still no running or jumping; deep loaded squats usually wait"),
    (26, 39, "Impact preparation",
     "progressive loading, low-impact cardio, hopping drills only if cleared by the surgeon",
     "return to running is usually discussed from 6 to 9 months, sometimes later"),
    (39, 52, "Return to sport",
     "sport-specific drills, gradual return to running and pivoting if cleared",
     "MRI-based graft maturation varies; clearance is individual"),
    (52, None, "Long-term joint care",
     "lifelong low-impact strength, weight management, load variety; protect the donor knee",
     "flare-ups after unusual load are common and usually settle with a short unload"),
]


SEXES = {"na": "prefer not to say", "female": "female", "male": "male"}
AGE_BANDS = {"na": "prefer not to say", "u30": "under 30", "30_45": "30–45", "45_60": "45–60", "60p": "60+"}

# What the literature says matters, by group — used only as a hint for the model about which
# evidence to prefer; never as a claim in itself.
_SEX_HINT = {
    "female": "woman: estrogen/progestin status, hormonal contraception or dienogest, iron/ferritin, "
              "pregnancy or breastfeeding history may matter for bone, tendon and recovery",
    "male": "man: testosterone status and typically higher muscle mass may matter for recovery",
}
_AGE_HINT = {
    "u30": "under 30: cartilage repair outcomes are typically best; peak bone mass still forming",
    "30_45": "30–45: age-related muscle loss begins — protein intake and strength work matter more; "
             "for women perimenopausal changes can start late in this band",
    "45_60": "45–60: slower tissue healing, menopause-related bone/tendon changes for women, "
             "sarcopenia risk — protein per kg and resistance training weigh more",
    "60p": "60+: slower healing, higher sarcopenia and osteoporosis risk, balance and fall prevention matter",
}


@dataclass
class Profile:
    surgery: str = "talus_oat"
    surgery_date: dt.date | None = None
    today: dt.date = field(default_factory=dt.date.today)
    sex: str = "na"
    age_band: str = "na"

    @property
    def weeks(self) -> int | None:
        if not self.surgery_date:
            return None
        return max(0, (self.today - self.surgery_date).days // 7)

    @property
    def months(self) -> float | None:
        w = self.weeks
        return None if w is None else round(w / 4.345, 1)

    @property
    def phase(self) -> dict | None:
        w = self.weeks
        if w is None:
            return None
        for start, end, name, focus, caution in PHASES:
            if w >= start and (end is None or w < end):
                return {"name": name, "start": start, "end": end,
                        "focus": focus, "caution": caution}
        return None

    def context(self) -> str:
        """Short block injected into prompts."""
        lines = [f"Surgery: {SURGERIES.get(self.surgery, self.surgery)}."]
        if self.weeks is None:
            lines.append("Surgery date not given — do not assume a phase; give ranges by phase.")
        else:
            p = self.phase
            end = "onwards" if p["end"] is None else f"to {p['end']}"
            lines.append(
                f"Today is week {self.weeks} (~{self.months} months) after surgery → typical phase "
                f"'{p['name']}' (weeks {p['start']} {end}). Typical focus: {p['focus']}. "
                f"Typical cautions: {p['caution']}."
            )
        lines.append("These windows are typical ranges across published protocols; the person's "
                     "own surgeon's protocol overrides them.")
        hints = [h for h in (_SEX_HINT.get(self.sex), _AGE_HINT.get(self.age_band)) if h]
        if hints:
            lines.append("Profile (" + "; ".join(hints) + ") — prefer evidence for this group when the "
                         "fragments offer it, and say when a number differs by sex or age.")
        return " ".join(lines)
