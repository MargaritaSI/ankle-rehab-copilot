# -*- coding: utf-8 -*-
"""
NVIDIA Nemotron via Nebius Token Factory (OpenAI-compatible API).

Three tiers so the app stays responsive and credits stretch:
  fast   — Nemotron 3 Nano   : scope check, query rewriting, doctor questions
  strong — Nemotron 3 Super  : the evidence answer and the daily routine
  deep   — Nemotron 3 Ultra  : "deep" comparisons (reasoning on)

ENV (see .env.example):
  NEBIUS_API_KEY      required
  NEBIUS_BASE_URL     default https://api.tokenfactory.nebius.com/v1
  NEMOTRON_FAST / NEMOTRON_STRONG / NEMOTRON_DEEP   optional model overrides
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import time

from dotenv import load_dotenv
from openai import OpenAI

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

BASE_URL = os.environ.get("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1")
MODELS = {
    "fast": os.environ.get("NEMOTRON_FAST", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"),
    "strong": os.environ.get("NEMOTRON_STRONG", "nvidia/nemotron-3-super-120b-a12b"),
    "deep": os.environ.get("NEMOTRON_DEEP", "nvidia/Nemotron-3-Ultra-550b-a55b"),
}
LABELS = {"fast": "Nemotron 3 Nano", "strong": "Nemotron 3 Super", "deep": "Nemotron 3 Ultra"}

# Rolling log of the calls made for the current request (shown in the UI footer).
CALLS: list[dict] = []


def configured() -> bool:
    return bool(os.environ.get("NEBIUS_API_KEY"))


def reset_calls() -> None:
    CALLS.clear()


def _client() -> OpenAI:
    return OpenAI(base_url=BASE_URL, api_key=os.environ.get("NEBIUS_API_KEY", "missing"))


def chat(messages: list[dict], tier: str = "strong", *, temperature: float = 0.2,
         max_tokens: int = 900, think: bool = False, purpose: str = "") -> str:
    """One chat completion. Reasoning is off unless `think=True` (then budget grows)."""
    model = MODELS[tier]
    kwargs: dict = {}
    if not think:
        kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
    else:
        max_tokens = max(max_tokens, 2500)
    t0 = time.time()
    resp = _client().chat.completions.create(
        model=model, messages=messages, temperature=temperature,
        max_tokens=max_tokens, **kwargs,
    )
    msg = resp.choices[0].message
    text = (msg.content or "").strip()
    CALLS.append({
        "tier": tier, "model": model, "label": LABELS[tier], "purpose": purpose,
        "seconds": round(time.time() - t0, 1),
        "tokens": getattr(resp.usage, "total_tokens", None),
        "think": think,
    })
    return text


def chat_json(messages: list[dict], tier: str = "fast", *, max_tokens: int = 400,
              purpose: str = "") -> dict:
    """Ask for JSON and parse the first {...} block; {} on failure."""
    text = chat(messages, tier, temperature=0.0, max_tokens=max_tokens, purpose=purpose)
    m = re.search(r"\{.*\}", text, flags=re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
