# Rehab Copilot — serves the Streamlit app (Hugging Face Space, Docker SDK, port 7860).
# The same image can run the corpus indexing job:
#   docker run --rm -v $(pwd)/corpus:/app/corpus rehab-copilot python job/index.py
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HOME=/app \
    HF_HOME=/app/.cache SENTENCE_TRANSFORMERS_HOME=/app/.cache \
    STREAMLIT_SERVER_HEADLESS=true STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

WORKDIR /app

# CPU-only torch keeps the image small; then the rest of the requirements.
COPY requirements.txt .
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements.txt

COPY . .

# Spaces run as uid 1000; the app writes the downloaded index, the KB cache and .usage.json
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app

# Warm the embedding model into the image so the first request is fast.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

EXPOSE 7860
CMD ["streamlit", "run", "app/app.py", "--server.port", "7860", "--server.address", "0.0.0.0", "--server.fileWatcherType", "none"]
