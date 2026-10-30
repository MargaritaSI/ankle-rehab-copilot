# -*- coding: utf-8 -*-
"""Fetch only the topics added on 2026-10-30 (anesthesia, psychology, scar, activity, heat, caffeine)."""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import fetch, topics
NEW = ['failed_marrow_stim', 'revision_olt', 'talus_bme', 'steroid_ankle', 'ankle_arthrodesis', 'ankle_tar', 'oat_donor_sites', 'talus_allograft', 'cystic_olt', 'supramalleolar', 'prp_ha_ankle', 'ankle_ligament', 'peroneal_achilles', 'heat_venous', 'heat_vasodilation', 'postop_edema_season']
for k in list(fetch.TOPICS):
    if k not in NEW:
        del fetch.TOPICS[k]
print("topics:", len(fetch.TOPICS))
fetch.main()
