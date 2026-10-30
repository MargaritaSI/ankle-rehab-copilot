# 🦴 Leg Recovery — Evidence Q&A (RAG on Nebius Serverless AI)

Образовательный RAG-ассистент, который отвечает на вопросы о восстановлении
после операций на хряще голеностопа (перенос костно-хрящевого аутотрансплантата,
OAT/OATS), противовоспалительном питании, добавках, влиянии гормональной терапии
(диеногест), беременности и долгосрочном сохранении сустава — **строго по
опубликованной литературе, с цитатами на каждый источник**.

Построен на **Nebius Serverless AI**: индексация — как **Job**, генерация
ответов — через self-hosted vLLM **Endpoint**.

> ⚠️ **Дисклеймер.** Проект — образовательная сводка публичных исследований,
> НЕ медицинский совет и НЕ диагностический инструмент. Использует только
> публичные Open-Access статьи; никаких персональных/пациентских данных.

---

## Архитектура

```
                 ЛОКАЛЬНО ($0)            NEBIUS SERVERLESS
 Europe PMC ──> corpus/fetch.py ──> [JOB] job/index.py ──> FAISS
 (Open Access)   чистый текст        чанкинг + эмбеддинги     │
                                                              ▼
 пользователь ─> app/app.py ─> endpoint/rag.py ─> [ENDPOINT] vLLM (Qwen2.5-7B)
                                  поиск top-k        ответ + цитаты [PMCID]
```

- **Job** (`job/index.py`) — строит векторную базу. Эмбеддинги локальной
  моделью `all-MiniLM-L6-v2` (CPU, бесплатно).
- **Endpoint** (`endpoint/deploy.md`) — `Qwen/Qwen2.5-7B-Instruct` через vLLM,
  OpenAI-совместимый API.
- **Anti-hallucination** — модель отвечает только по найденным фрагментам,
  иначе честно говорит «нет данных».

## Источники корпуса (всё публичное, воспроизводимое)
- **Europe PMC / PubMed Central Open Access** — полнотекст статей через REST API.
- (опц.) клинические гайдлайны NICE/WHO — публичные PDF.
- Темы поиска: см. `corpus/topics.py`.

## Быстрый старт

```bash
git clone <repo> && cd leg-recovery-rag
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1) собрать корпус локально (бесплатно)
python corpus/fetch.py --per-topic 15

# 2) построить индекс (локально для отладки ИЛИ как Nebius Job)
python job/index.py
#   как Job:  nebius ai job create --file job/job.yaml

# 3) поднять LLM-endpoint на Nebius (см. endpoint/deploy.md)
#    затем выставить переменные:
export NEBIUS_BASE_URL="http://<endpoint-ip>:8000/v1"
export NEBIUS_API_KEY="<token>"
export NEBIUS_MODEL="Qwen/Qwen2.5-7B-Instruct"

# 4) демо
streamlit run app/app.py
```

## Конфигурация железа
| Компонент | Ресурс | Зачем |
|---|---|---|
| Сбор корпуса | ноутбук, CPU | парсинг текста, $0 |
| Job индексации | `cpu-4vcpu-16gb` | эмбеддинги на CPU |
| Endpoint LLM | `gpu-l40s-a` (1×L40S) | инференс Qwen2.5-7B |

## Ожидаемый результат
Вопрос → связный ответ из 1–3 абзацев, **каждое утверждение с [PMCID]** и
списком источников со ссылками на PMC. Если данных нет — явный отказ.

## Время и стоимость (ориентир)
- Сбор корпуса: ~10–20 мин, **$0**.
- Job индексации: ~5–15 мин, центы.
- Endpoint: ~$1.5–2/час; держать включённым только на тесты+видео.
- **Весь проект: ≈ $10–15 из $100 промо-кредитов.**

## Доказательство запуска (для сабмита)
- лог Nebius Job (`corpus/index/` создан),
- `nebius ai endpoint list` со статусом Running,
- ответ `curl /v1/chat/completions`.

## Лицензия
MIT — см. `LICENSE`. Без секретов и приватных данных в репозитории.
```
```
