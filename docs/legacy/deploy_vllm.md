# Деплой LLM как Nebius Serverless Endpoint (vLLM)

> Цель: поднять OpenAI-совместимый endpoint с `Qwen/Qwen2.5-7B-Instruct` на самом
> дешёвом GPU, протестировать, записать видео — и **удалить**. Цикл ≈ $10–15.
> Команды сверены с актуальной докой Nebius (2026).

## 0. Активация (интерактивно, делаешь сама)
1. Применить промокод $100: консоль → **Billing → Apply promo code** → проверить,
   что баланс стал $100.
2. Установить CLI: см. https://docs.nebius.com/cli/install
3. Залогиниться (откроется браузер): `nebius profile create`
4. Проверить конфиг: `cat ~/.nebius/config.yaml` (там project-id).

## 1. Параметры
```bash
export MODEL_ID="Qwen/Qwen2.5-7B-Instruct"
export AUTH_TOKEN=$(openssl rand -hex 32)        # секрет, НЕ коммитить
export SUBNET_ID=$(nebius vpc subnet list --format json | jq -r '.items[0].metadata.id')
echo "TOKEN=$AUTH_TOKEN"                          # сохрани — понадобится для запросов
```

## 2. Создать endpoint (vLLM, 1×L40S)
```bash
nebius ai endpoint create \
  --name leg-recovery-llm \
  --image vllm/vllm-openai:latest \
  --container-command "python3 -m vllm.entrypoints.openai.api_server" \
  --args "--model $MODEL_ID --host 0.0.0.0 --port 8000 --max-model-len 8192" \
  --platform gpu-l40s-a \
  --preset 1gpu-8vcpu-32gb \
  --public \
  --container-port 8000 \
  --auth token \
  --token "$AUTH_TOKEN" \
  --shm-size 16Gi \
  --subnet-id "$SUBNET_ID"
```

## 3. Узнать адрес (подождать, пока статус Running — модель грузится ~2–5 мин)
```bash
export ENDPOINT_ID=$(nebius ai endpoint list --format json | jq -r '.items[0].metadata.id')
export ENDPOINT_IP=$(nebius ai endpoint get "$ENDPOINT_ID" --format json | jq -r '.status.public_endpoints[0]')
echo "URL=$ENDPOINT_IP"
```

## 4. Переменные для RAG
```bash
export NEBIUS_BASE_URL="http://$ENDPOINT_IP:8000/v1"   # уточни порт по выводу выше
export NEBIUS_API_KEY="$AUTH_TOKEN"
export NEBIUS_MODEL="Qwen/Qwen2.5-7B-Instruct"
```

## 5. Проверка
```bash
curl "$NEBIUS_BASE_URL/models" -H "Authorization: Bearer $NEBIUS_API_KEY"
python endpoint/rag.py "What supplements support cartilage healing after surgery?"
```

## 6. ВАЖНО — удалить после демо (экономия кредитов!)
```bash
nebius ai endpoint delete "$ENDPOINT_ID"
```

## Доказательство запуска (для сабмита)
- скриншот `nebius ai endpoint list` (Running),
- ответ `curl /v1/chat/completions`,
- лог Job-индексации (теги + чанки).
```
#NebiusServerlessChallenge
```
