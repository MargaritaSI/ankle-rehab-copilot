# -*- coding: utf-8 -*-
"""Fetch only the topics added on 2026-10-30 (anesthesia, psychology, scar, activity, heat, caffeine)."""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fetch, topics
NEW = ['hydrostatic_tissue', 'aquatic_dose', 'aquatic_early_postop', 'olt_conservative', 'olt_physio_vs_surgery', 'bme_conservative', 'muscle_offload_joint', 'steroid_repeat_cartilage', 'failed_arthroscopy_3y', 'overload_cartilage', 'underload_cartilage', 'load_progression_criteria', 'perfusion_poor_healing', 'revision_vs_primary_rehab']
for k in list(fetch.TOPICS):
    if k not in NEW:
        del fetch.TOPICS[k]
print("topics:", len(fetch.TOPICS))
fetch.main()
