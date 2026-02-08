# ⚠️ Restart Required

## Проблема
API endpoint `/limits` возвращает 404 потому что сервер запущен со старым кодом.

## Решение

### Вариант 1: Быстрый рестарт
```bash
cd wallet-taker
./restart.sh
```

### Вариант 2: Ручной рестарт
```bash
# 1. Остановить текущий процесс
pkill -f "bun run src/index.ts"

# 2. Запустить заново
bun run dev
```

### Вариант 3: С веб-панелью
```bash
# Остановить все процессы
pkill -f "bun run"

# Запустить backend + frontend
bun run dev:web+server
```

## Проверка

После рестарта проверь:

```bash
# 1. Health check
curl http://localhost:3001/health

# 2. Limits endpoint
curl http://localhost:3001/limits

# Должен вернуть:
# {
#   "limits": [...],
#   "stats": {...}
# }
```

## Что было добавлено

1. **Database Service** - SQLite база для истории выводов
2. **Auto-Limits System** - автоматическое одобрение с лимитами
3. **New API Endpoints**:
   - `GET /limits` - получить лимиты
   - `POST /limits` - обновить лимит
   - `GET /withdrawals/:id/history` - логи вывода
   - `GET /address/:address/history` - история адреса

4. **UI Component** - вкладка "Limits" в веб-панели

## Troubleshooting

### База данных не создается
```bash
# Проверь права
ls -la data/

# Создай папку если нужно
mkdir -p data
```

### Порт занят
```bash
# Найди процесс
lsof -i :3001

# Убей процесс
kill -9 <PID>
```

### Ошибка импорта
```bash
# Переустанови зависимости
rm -rf node_modules
bun install
```
