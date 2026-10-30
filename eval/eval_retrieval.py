# -*- coding: utf-8 -*-
"""
ДИАГНОСТИКА КАЧЕСТВА (бесплатно, без модели).

Для каждого из ~30 реальных вопросов смотрим:
  - сколько РАЗНЫХ статей подтянулось (мало = риск однобокого/слабого ответа)
  - максимальную близость top-1 (низкая = тема плохо покрыта → риск «нет данных»
    или галлюцинации, если модель попытается ответить)
Помечаем 🟢/🟡/🔴 — это карта, где система, скорее всего, ошибётся.
Запуск:  python eval/eval_retrieval.py
"""
import sys
import pathlib

sys.path.append(str(pathlib.Path(__file__).parent.parent / "endpoint"))
from rag import retrieve  # noqa: E402

QUESTIONS = [
    # операция / диагностика
    "What is osteochondral autograft transfer (OAT) of the talus?",
    "Why might microfracture of the talus fail and need revision?",
    "What does bone marrow edema of the talus mean after surgery?",
    "Donor site problems in the knee after taking an osteochondral graft",
    # реабилитация / нагрузка / упражнения
    "Weight-bearing protocol week by week after talus cartilage surgery",
    "Which exercises and target muscles in early rehab after ankle surgery?",
    "When can I return to sport after ankle cartilage surgery?",
    "Range of motion exercises to prevent ankle stiffness after surgery",
    "Does rehabilitation adherence affect recovery outcomes?",
    "Ankle proprioception and balance exercises after injury",
    # отёк / термо / компрессия
    "Persistent leg swelling 5 months after cartilage surgery, what to do?",
    "Why does the leg swell after standing or sitting for hours?",
    "Does contrast hot-cold water therapy help swelling and recovery?",
    "Cryotherapy after surgery effect on pain and edema",
    "Compression therapy for lower limb swelling after surgery",
    "Manual lymphatic drainage technique for leg edema",
    # питание / добавки / гидратация
    "How many grams of protein per day for muscle and bone recovery?",
    "Best food sources of protein and healthy fats for recovery",
    "Vitamin D and calcium dose for bone healing",
    "Do glucosamine and chondroitin help cartilage?",
    "Curcumin and collagen for joint inflammation",
    "Omega-3 effect on osteoarthritis and cartilage",
    "Daily water intake for joint and cartilage health",
    # гормоны / женщины / беременность
    "Does dienogest affect bone mineral density long term?",
    "How do hormones and estrogen affect cartilage in women?",
    "Pregnancy effect on joint laxity and cartilage",
    # факторы / группы
    "Iron deficiency and ferritin effect on tissue healing in women",
    "Smoking and alcohol effect on bone and cartilage healing",
    "Low-impact home exercises for women over 30 to protect joints",
    "Sarcopenia and recovery in older adults",
    # анти-галлюцинация (намеренно вне корпуса)
    "Which sneaker brand is best for ankle recovery?",
    "What is the best meditation app for pain?",
]


def main():
    print(f"{'flag':4} {'#src':>4} {'top':>5}  question")
    weak = []
    for q in QUESTIONS:
        hits = retrieve(q, k=6)
        distinct = len({h["meta"].get("pmcid") for h in hits})
        top = max((h["score"] for h in hits), default=0.0)
        if top < 0.35 or distinct <= 1:
            flag = "🔴"; weak.append(q)
        elif top < 0.45 or distinct <= 2:
            flag = "🟡"
        else:
            flag = "🟢"
        print(f"{flag:4} {distinct:>4} {top:>5.2f}  {q[:70]}")
    print(f"\nСлабых (🔴): {len(weak)}")
    for w in weak:
        print("  -", w)


if __name__ == "__main__":
    main()
