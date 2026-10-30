# -*- coding: utf-8 -*-
"""
ТЕМЫ КОРПУСА (поисковые запросы к Europe PMC).

ВАЖНО: это поисковые строки для сбора ПУБЛИЧНОЙ литературы.
Личный медицинский сценарий сюда НЕ попадает — он только помогал
выбрать темы. Жюри воспроизводит базу по этим же запросам.

Каждый запрос -> Europe PMC Open Access -> чистый текст статей.
Меняй/добавляй строки свободно: пайплайн их просто перебирает.
"""

TOPICS = {
    # --- Основная операция: перенос хряща в таранную кость ---
    "oat_talus": "osteochondral autograft transfer talus outcomes",
    "olt_rehab": "osteochondral lesion talus postoperative rehabilitation recovery",
    "oats_ankle": "OATS mosaicplasty ankle cartilage repair",
    "failed_microfracture": "failed microfracture talus revision cartilage",
    "knee_donor": "donor site morbidity knee osteochondral autograft harvest",
    "bone_edema": "bone marrow edema talus ankle subchondral MRI",

    # --- Реабилитация / нагрузка ---
    "weight_bearing": "progressive weight bearing protocol ankle cartilage surgery",
    "loading": "mechanotherapy cartilage loading rehabilitation outcomes",
    "adherence": "rehabilitation adherence outcomes orthopedic surgery",

    # --- Питание / добавки / противовоспалительное ---
    "anti_inflammatory": "anti-inflammatory diet cartilage joint repair",
    "supplements": "omega-3 collagen vitamin D vitamin C cartilage bone healing",
    "nutrition_bone": "nutrition supplements bone healing fracture recovery",

    # --- Гормоны / контрацептивы / диеногест (эндометриоз) ---
    "dienogest_bone": "dienogest bone mineral density long term",
    "progestin_bone": "progestin contraceptive bone health cartilage",
    "endometriosis_dienogest": "endometriosis dienogest treatment effects",

    # --- Беременность ---
    "pregnancy_joint": "pregnancy relaxin joint laxity cartilage weight bearing",
    "postpartum_recovery": "postpartum musculoskeletal recovery bone density",
    "pregnancy_ligament": "relaxin hormone ligament laxity pelvic joint pregnancy",
    "pregnancy_msk": "pregnancy musculoskeletal pain joint cartilage changes",

    # --- Сохранение сустава на годы / артроз ---
    "joint_preservation": "joint preservation avoid revision surgery long term outcome",
    "ptoa": "post-traumatic osteoarthritis ankle prevention progression",
    "women_bone": "women bone health estrogen cartilage age 30 40",

    # --- Кровь / железо / кровоснабжение (часто низкий ферритин у женщин) ---
    "iron_deficiency": "iron deficiency anemia perioperative recovery surgery",
    "ferritin_women": "iron deficiency ferritin musculoskeletal recovery women",
    "perfusion_healing": "peripheral perfusion blood supply limb bone healing",

    # --- Группы: мужчины ---
    "men_recovery": "testosterone bone muscle recovery men orthopedic rehabilitation",

    # --- Группы: пожилые ---
    "elderly_healing": "elderly cartilage bone healing recovery surgery outcome",
    "sarcopenia": "sarcopenia aging muscle bone rehabilitation older adults",

    # --- КОНКРЕТНЫЕ протоколы: фазы, упражнения, мышцы, сроки ---
    "rehab_protocol": "ankle rehabilitation protocol phases weeks exercises return to sport talus",
    "rehab_phases": "osteochondral repair postoperative rehabilitation phased weight bearing range of motion",
    "ankle_strengthening": "ankle strengthening exercises calf peroneal proprioception balance rehabilitation",
    "return_to_sport": "return to sport criteria timeline after ankle cartilage surgery",

    # --- Отёк: механизм и работа с ним ---
    "edema_management": "edema swelling management compression elevation lower limb postoperative",
    "dependent_edema": "prolonged standing dependent edema venous lymphatic return lower limb",

    # --- Лимфодренаж / самомассаж ---
    "lymphatic_drainage": "manual lymphatic drainage massage lower limb edema technique",
    "self_massage": "self-massage soft tissue mobilization ankle recovery technique",

    # --- Долгосрочная поддержка сустава / женщины 30+ / дом / low-impact ---
    "long_term_joint": "long term exercise program joint health maintenance osteoarthritis prevention",
    "low_impact_women": "low impact exercise women joint health home based program",
    "daily_routine": "daily physical activity habits joint mobility sedentary breaks",

    # --- Питание: вода, БЖУ, усвоение ---
    "hydration": "hydration fluid intake recovery cartilage synovial joint",
    "protein_intake": "protein intake requirement grams muscle bone recovery older adults",
    "macronutrients": "macronutrient distribution protein fat carbohydrate recovery musculoskeletal",
    "food_sources": "dietary protein sources bioavailability absorption recovery healthy fats",

    # --- Термо-процедуры: контраст, холод, тепло ---
    "contrast_therapy": "contrast water therapy hot cold immersion recovery swelling",
    "cryotherapy": "cryotherapy cold therapy postoperative pain swelling rehabilitation",
    "heat_therapy": "thermotherapy heat application joint stiffness rehabilitation",

    # --- Компрессия / низконагрузочный тренинг ---
    "compression": "compression therapy garment stocking lower limb edema recovery",
    "bfr_training": "blood flow restriction training low load muscle strength rehabilitation",

    # --- Модифицируемые факторы ---
    "smoking_alcohol": "smoking alcohol effect bone cartilage healing surgery outcome",
    "weight_load": "body weight BMI joint load osteoarthritis progression",
    "sleep_recovery": "sleep quality musculoskeletal recovery tissue repair",

    # --- Дозировки добавок ---
    "vitamin_d_calcium": "vitamin D calcium supplementation dose bone healing",
    "glucosamine_chondroitin": "glucosamine chondroitin sulfate osteoarthritis cartilage evidence",
    "curcumin_collagen": "curcumin collagen peptide supplementation joint inflammation dose",

    # --- NSAIDs и заживление (спорный) ---
    "nsaids_healing": "NSAIDs effect bone cartilage healing after surgery",

    # --- Анестезия и первые дни: побочные эффекты, выбор анестезии (добавлено 2026-10-30) ---
    "anesthesia_gi": "postoperative nausea vomiting general anesthesia gastrointestinal side effects heartburn reflux recovery",
    "regional_vs_general": "regional anesthesia versus general anesthesia foot ankle surgery outcomes recovery side effects",
    "nerve_block_ankle": "peripheral nerve block ankle surgery postoperative pain opioid sparing",
    "post_anesthesia_fatigue": "postoperative fatigue cognitive recovery after general anesthesia adults",

    # --- Психологическая сторона операции и восстановления ---
    "preop_anxiety": "preoperative anxiety orthopedic surgery evidence based interventions breathing relaxation",
    "postop_mood": "postoperative depression low mood orthopedic recovery prevalence risk factors coping",
    "cbt_rehab": "cognitive behavioral therapy rehabilitation adherence musculoskeletal injury recovery",
    "fear_avoidance": "kinesiophobia fear of movement after surgery rehabilitation outcomes intervention",
    "mindfulness_breathing": "mindfulness breathing exercises pain stress postoperative recovery randomized",
    "emdr_medical": "EMDR eye movement desensitization medical trauma surgery distress",
    "sleep_recovery": "sleep quality tissue healing recovery after surgery",

    # --- Рубец ---
    "scar_silicone": "silicone gel sheet scar management surgical scar randomized",
    "scar_sun": "scar sun protection hyperpigmentation photoprotection postoperative",
    "scar_massage": "scar massage mobilization postoperative function",

    # --- Низкоударная активность, компрессия, жара ---
    "aquatic_cycling": "aquatic therapy swimming stationary cycling elliptical lower limb rehabilitation joint load",
    "joint_loading_modalities": "joint contact force walking cycling elliptical swimming comparison lower extremity",
    "heat_edema": "ambient heat summer lower limb swelling venous edema dependent position",
    "elevation_edema": "leg elevation above heart level edema reduction postoperative",
    "caffeine_bone": "caffeine coffee intake bone mineral density calcium absorption fracture healing",
    "caffeine_inflammation": "coffee consumption inflammation markers joint health osteoarthritis",

    # --- После неудачной артроскопии / ревизия (добавлено 2026-10-30, вечер) ---
    "failed_marrow_stim": "failed bone marrow stimulation microfracture osteochondral lesion talus revision options outcomes",
    "revision_olt": "revision surgery osteochondral lesion talus after failed arthroscopy",
    "talus_bme": "bone marrow edema talus osteochondral lesion persistent pain MRI after microfracture",
    "steroid_ankle": "intra-articular corticosteroid injection ankle cartilage chondrotoxicity repeated injections",
    "ankle_arthrodesis": "ankle arthrodesis fusion outcomes adjacent joint arthritis young patients",
    "ankle_tar": "total ankle arthroplasty versus arthrodesis outcomes young active patients",
    "oat_donor_sites": "osteochondral autograft donor site knee versus talus versus femoral head comparison morbidity",
    "talus_allograft": "fresh osteochondral allograft talus outcomes",
    "cystic_olt": "subchondral cyst osteochondral lesion talus treatment",
    "supramalleolar": "supramalleolar osteotomy ankle cartilage lesion realignment",
    "prp_ha_ankle": "platelet rich plasma hyaluronic acid injection ankle osteochondral lesion",
    # --- Связки и сухожилия ---
    "ankle_ligament": "lateral ankle ligament instability reconstruction rehabilitation chronic",
    "peroneal_achilles": "peroneal tendon Achilles tendinopathy after ankle surgery rehabilitation",
    # --- Жара и отёк ---
    "heat_venous": "heat exposure venous insufficiency leg edema seasonal variation symptoms",
    "heat_vasodilation": "thermoregulation cutaneous vasodilation lower limb swelling hot environment",
    "postop_edema_season": "seasonal variation postoperative swelling wound complications summer orthopedic",

    # --- Нервы после операций на голеностопе; плавание как нагрузка (добавлено 2026-10-30, вечер) ---
    "nerve_arthroscopy": "superficial peroneal nerve sural nerve injury ankle arthroscopy portal complications paresthesia",
    "nerve_recovery": "postoperative numbness paresthesia foot ankle surgery recovery time neuropraxia management",
    "nerve_exercise": "peripheral nerve irritation exercise modification continue activity load adjustment",
    "swim_kick_ankle": "swimming flutter kick ankle plantarflexion load joint stress rehabilitation",
    "aquatic_postop": "aquatic exercise hydrostatic pressure postoperative lower limb effects edema joint",

    # --- Возраст и пол (добавлено 2026-10-30, вечер) ---
    "muscle_loss_30s": "age-related muscle loss begins thirties forties resistance training protein requirements adults",
    "perimenopause_msk": "perimenopause menopause estrogen decline tendon cartilage bone muscle musculoskeletal syndrome of menopause",
    "women_iron_recovery": "iron deficiency women fatigue tissue healing exercise recovery ferritin",
    "hormonal_contraception_tendon": "hormonal contraception estrogen progestin tendon collagen ligament laxity injury",
    "men_testosterone_bone": "men testosterone decline bone density muscle recovery after orthopedic surgery",
    "older_adults_cartilage": "older adults cartilage repair outcomes age over 50 osteochondral",

    # --- Вода: давление, дозировка; консервативное лечение после неудачной артроскопии (добавлено 2026-10-30, вечер 2) ---
    "hydrostatic_tissue": "hydrostatic pressure immersion effects on soft tissue nerve conduction paresthesia lower limb",
    "aquatic_dose": "aquatic therapy session duration minutes frequency dose response postoperative orthopedic rehabilitation",
    "aquatic_early_postop": "early aquatic rehabilitation after lower limb surgery outcomes complications wound",
    "olt_conservative": "nonoperative conservative management osteochondral lesion talus outcomes physiotherapy",
    "olt_physio_vs_surgery": "physiotherapy versus surgery osteochondral lesion talus symptomatic patients decision",
    "bme_conservative": "bone marrow edema talus treatment unloading bisphosphonate iloprost extracorporeal shockwave outcomes",
    "muscle_offload_joint": "muscle strengthening peroneal tibialis reduces ankle joint load compensation cartilage defect",
    "steroid_repeat_cartilage": "repeated intra-articular corticosteroid injections cartilage volume loss randomized",
    "failed_arthroscopy_3y": "persistent pain years after ankle arthroscopy microfracture second look findings",
    # --- Сценарии нагрузки: недо- и перетренировка, перфузия ---
    "overload_cartilage": "excessive loading cartilage repair failure graft overload early return signs",
    "underload_cartilage": "immobilization disuse cartilage atrophy insufficient loading rehabilitation",
    "load_progression_criteria": "criteria based progression rehabilitation load monitoring pain rule 24 hours",
    "perfusion_poor_healing": "impaired peripheral perfusion smoking diabetes delayed healing orthopedic what improves perfusion exercise",
    "revision_vs_primary_rehab": "revision cartilage surgery rehabilitation differences primary slower progression outcomes",
}
