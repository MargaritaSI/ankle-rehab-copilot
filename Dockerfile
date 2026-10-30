# Dockerfile для Nebius Serverless Job (ingestion + indexing).
# Воспроизводимый образ: ставит зависимости и запускает индексацию.
# Сборка:   docker build -t leg-recovery-job .
# Запуск:   docker run --rm -v $(pwd)/corpus:/app/corpus leg-recovery-job
# (как Nebius Job — образ в реестр, затем job/job.yaml ссылается на него)
FROM python:3.12-slim

WORKDIR /app

# системные зависимости для faiss/torch колёс не нужны на slim+wheels
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# по умолчанию — индексация корпуса (Job). Сбор делается отдельно (corpus/fetch.py).
CMD ["python", "job/index.py"]
