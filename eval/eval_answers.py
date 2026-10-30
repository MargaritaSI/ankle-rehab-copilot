# -*- coding: utf-8 -*-
"""
End-to-end answer check: the 9 questions from the earlier bot evaluation
(scripts/leg_kb/_reports/rag_eval.json in the Telegram bot), 2 out-of-scope
probes and 2 nutrition probes. Writes a markdown report to eval/_reports/.

    python eval/eval_answers.py
"""
import datetime as dt
import pathlib
import re
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "endpoint"))
import rag  # noqa: E402
from phase import Profile  # noqa: E402

QUESTIONS = [
    ("in", "Можно ли мне приседать на 5 месяце и как глубоко?"),
    ("in", "Что есть, чтобы быстрее зажил хрящ?"),
    ("in", "Нужен ли мне креатин?"),
    ("in", "Можно ли начинать бегать?"),
    ("in", "Как понять, что я перегружаю ногу?"),
    ("in", "Как разгрузить донорское колено при спуске по лестнице?"),
    ("in", "Какие упражнения на пресс безопасны для моей ноги?"),
    ("in", "Сколько белка мне нужно в день?"),
    ("in", "Помогает ли коллаген для хряща?"),
    ("in", "Does coffee / caffeine affect calcium, bone healing or joint inflammation? How much is too much?"),
    ("in", "Влияет ли диеногест на плотность кости при длительном приёме?"),
    ("out", "Which running-shoe brand is best for ankle recovery?"),
    ("out", "Упражнения при грыже поясничного отдела?"),
]

prof = Profile(surgery_date=dt.date.today() - dt.timedelta(weeks=22))
out = [f"# Answer evaluation — {dt.datetime.now():%Y-%m-%d %H:%M}\n",
       "Profile: talus OAT, week 22. Columns: scope decision · source · citations · seconds.\n"]
summary = []
for expect, q in QUESTIONS:
    t = time.time()
    try:
        r = rag.answer(q, prof)
    except Exception as exc:
        out.append(f"\n## {q}\n\nERROR: {exc}\n")
        summary.append((q, "ERR", "", 0, 0))
        continue
    secs = round(time.time() - t, 1)
    cites = set(re.findall(r"\[(KB-\d+|PMC\d+|WEB-\d+)\]", r["answer"]))
    rt = r["routing"]
    flag = "OK" if (rt["in_scope"] == (expect == "in")) else "SCOPE-MISS"
    summary.append((q, flag, r["source"], len(cites), secs))
    out.append(f"\n## {q}\n\n`expected={expect}` · `in_scope={rt['in_scope']}` ({rt['reason']}) · "
               f"source={r['source']} · citations={len(cites)} · {secs}s · "
               f"query_en: _{rt['query_en']}_\n\n{r['answer']}\n")
    ev = r["evidence"]
    out.append("Sources: " + "; ".join(
        [f"[{n['id']}] {n['title'][:60]}" for n in ev["notes"]] +
        [f"[{p['id']}] {p['title'][:60]}" for p in ev["papers"]] +
        [f"[{w['id']}] {w['url']}" for w in ev["web"]]) + "\n")

out.insert(2, "\n| question | scope | source | cites | s |\n|---|---|---|---|---|\n" +
           "\n".join(f"| {q[:60]} | {f} | {s} | {c} | {t} |" for q, f, s, c, t in summary) + "\n")
path = pathlib.Path(__file__).parent / "_reports" / f"answers_{dt.datetime.now():%Y%m%d_%H%M}.md"
path.write_text("\n".join(out), encoding="utf-8")
print(path)
for row in summary:
    print(row)
