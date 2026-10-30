# -*- coding: utf-8 -*-
"""Fetch only the topics added on 2026-10-30 (anesthesia, psychology, scar, activity, heat, caffeine)."""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fetch, topics
NEW = ["anesthesia_gi", "regional_vs_general", "nerve_block_ankle", "post_anesthesia_fatigue",
       "preop_anxiety", "postop_mood", "cbt_rehab", "fear_avoidance", "mindfulness_breathing",
       "emdr_medical", "sleep_recovery", "scar_silicone", "scar_sun", "scar_massage",
       "aquatic_cycling", "joint_loading_modalities", "heat_edema", "elevation_edema",
       "caffeine_bone", "caffeine_inflammation"]
for k in list(fetch.TOPICS):
    if k not in NEW:
        del fetch.TOPICS[k]
print("topics:", len(fetch.TOPICS))
fetch.main()
