# emufetch 🌐

Browser Emulation Fetch Service - выполняет HTTP запросы в контексте реального браузера.

## Зачем?

Некоторые API проверяют:

- Реальные браузерные fingerprints
- JavaScript execution environment
- Cookies и сессии
- CloudFlare / Captcha challenges

emufetch запускает настоящий Chromium и выполняет fetch запросы изнутри браузера.

## API

### POST /fetch

Выполнить HTTP запрос в контексте браузера:

```bash
curl -X POST http://localhost:8916/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/data",
    "method": "GET"
  }'
```

С POST body:

```bash
curl -X POST http://localhost:8916/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/submit",
    "method": "POST",
    "body": {"key": "value"},
    "headers": {"Authorization": "Bearer xxx"}
  }'
```

Response:

```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": { "data": "..." }
}
```

### POST /navigate

Навигация браузера на страницу (для получения cookies, сессий):

```bash
curl -X POST http://localhost:8916/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/login"}'
```

### GET /screenshot

Скриншот текущего состояния браузера (для дебага):

```bash
curl http://localhost:8916/screenshot > screenshot.png
```

### GET /health

Health check:

```bash
curl http://localhost:8916/health
# {"status":"ok","browser":true}
```

## Docker

### Build

```bash
docker build -t emufetch -f src/emufetch/Dockerfile .
```

### Run

```bash
# Без VNC
docker run -d --name emufetch -p 8916:8916 emufetch

# С VNC (для дебага - подключайся VNC клиентом к localhost:5900)
docker run -d --name emufetch \
  -p 8916:8916 \
  -p 5900:5900 \
  -e ENABLE_VNC=true \
  emufetch
```

### Docker Compose

Добавь в `docker-compose.yml`:

```yaml
emufetch:
  build:
    context: .
    dockerfile: src/emufetch/Dockerfile
  container_name: emufetch
  ports:
    - "8916:8916"
    - "5900:5900" # VNC для дебага
  environment:
    - ENABLE_VNC=true
  restart: unless-stopped
```

## Локальная разработка

```bash
# Установи зависимости (из корня проекта)
bun install puppeteer

# Запусти
bun run src/emufetch/index.ts
```

⚠️ Локально браузер откроется как обычное окно. В Docker используется виртуальный дисплей (Xvfb).

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Container                      │
│                                                          │
│  ┌─────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │  Xvfb   │───▶│   Chromium   │◀───│   Puppeteer   │   │
│  │ :99     │    │  (non-head)  │    │               │   │
│  └─────────┘    └──────────────┘    └───────┬───────┘   │
│       │                                      │          │
│       ▼                                      ▼          │
│  ┌─────────┐                         ┌──────────────┐   │
│  │  VNC    │                         │  Bun Server  │   │
│  │ :5900   │                         │    :8916     │   │
│  └─────────┘                         └──────────────┘   │
│                                              │          │
└──────────────────────────────────────────────┼──────────┘
                                               │
                                               ▼
                                    POST /fetch requests
```

## Использование из Polygon

```typescript
// В любом source или сервисе
async function fetchWithBrowser(
  url: string,
  method: "GET" | "POST" = "GET",
  body?: object,
) {
  const response = await fetch("http://emufetch:8916/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method, body }),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.body;
}

// Использование
const data = await fetchWithBrowser("https://protected-api.com/data");
```
