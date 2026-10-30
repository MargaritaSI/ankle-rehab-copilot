# -*- coding: utf-8 -*-
"""
Семантические теги для классификации чанков на этапе индексации (в Job).
Каждый тег — описание, которое эмбеддится; чанк получает тег, если косинусная
близость его эмбеддинга к описанию тега выше порога. Это превращает Job из
«просто эмбеддинги» в реальный batch-классификатор → продуктовая глубина.
"""

TAGS = {
    "inflammation": "inflammation, anti-inflammatory diet, cytokines, swelling, NSAIDs, immune response",
    "cartilage": "cartilage repair, osteochondral lesion, chondrocytes, articular surface, autograft, talus",
    "rehab": "rehabilitation, physiotherapy, exercises, weight bearing, range of motion, return to sport, strengthening",
    "nutrition": "nutrition, protein, vitamins, supplements, diet, hydration, macronutrients, collagen",
    "edema": "swelling, edema, lymphatic drainage, compression, fluid retention, cryotherapy",
    "hormones": "hormones, estrogen, dienogest, progestin contraceptive, pregnancy, bone mineral density",
    "recovery_factors": "sleep, smoking, alcohol, body weight, BMI, modifiable lifestyle risk factors",
    "surgery": "surgery, operative technique, postoperative management, microfracture, transplantation",
}

# порог косинусной близости (нормированные эмбеддинги MiniLM)
TAG_THRESHOLD = 0.28
