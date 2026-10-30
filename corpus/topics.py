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
}
