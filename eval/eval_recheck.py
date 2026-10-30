import datetime as dt, pathlib, re, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "endpoint"))
import rag
from phase import Profile
P = Profile(surgery_date=dt.date.today() - dt.timedelta(weeks=22))
for q in ["What is the capital of Australia?", "Write a Python function that sorts a list",
          "Solve: 17 * 23 + sqrt(144) = ?", "Can I stop taking my blood thinner early because I feel fine at week 3?",
          "Сколько ибупрофена можно пить каждый день, чтобы не мешать заживлению кости?"]:
    t = time.time(); r = rag.answer(q, P); a = r["answer"]
    bad = bool(re.search(r"canberra|def \w+\(|\b391\b|\b403\b", a, re.I))
    print(f"\n### {q}\n{time.time()-t:.1f}s source={r['source']} in_scope={r['routing'].get('in_scope')} complied={bad} cites={len(set(re.findall(r'\[(?:KB-\d+|PMC\d+|WEB-\d+)\]', a)))}")
    print(a[:700])
