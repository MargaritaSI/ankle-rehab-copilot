# -*- coding: utf-8 -*-
"""Fetch only the topics added on 2026-10-30 (anesthesia, psychology, scar, activity, heat, caffeine)."""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fetch, topics
NEW = ['nerve_arthroscopy', 'nerve_recovery', 'nerve_exercise', 'swim_kick_ankle', 'aquatic_postop', 'muscle_loss_30s', 'perimenopause_msk', 'women_iron_recovery', 'hormonal_contraception_tendon', 'men_testosterone_bone', 'older_adults_cartilage']
for k in list(fetch.TOPICS):
    if k not in NEW:
        del fetch.TOPICS[k]
print("topics:", len(fetch.TOPICS))
fetch.main()
