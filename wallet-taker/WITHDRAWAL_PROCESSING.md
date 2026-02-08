# Withdrawal Processing Guide

## Overview

Автоматическая обработка выводов через polygonmoneyflow API с проверкой лимитов и логированием.

## Flow

### 1. **Получение запроса на вывод**
```
Exchange -> withdrawal_request
  ↓
Taker -> Проверка лимитов (auto-approval)
  ↓
Если одобрено -> Автоматическая обработка
Если отклонено -> Manual Review
```

### 2. **Проверка автоодобрения**

Проверяются 3 условия:
- ✅ **Amount Limit**: Сумма не превышает лимит для символа
- ✅ **Cooldown**: Прошла минута с последнего вывода с адреса
- ✅ **Duplicate**: Сумма отличается от предыдущего вывода

### 3. **Обработка через API**

```typescript
POST /transactions/refinanceTransfer
{
  "chain": "solana",
  "to": "Csm1o2R8iuzDi9AuEEb89Tt3TChU9nqfeJQgXmoaazVZ",
  "amount": "0.0001",
  "allowSplit": true,
  "asset": "USDT" // или "" для native coin
}
```

**Response:**
```json
{
  "chain": "solana",
  "to": "Csm1o2R8iuzDi9AuEEb89Tt3TChU9nqfeJQgXmoaazVZ",
  "requestedAmount": "0.0001",
  "transferredAmount": "0.0001",
  "remainingAmount": "0",
  "transfers": [
    {
      "walletId": "74d861cd-...",
      "fromAddress": "AxxVx4DuF63...",
      "amount": "0.0001",
      "txHash": "2QU1eWFjJCr...",
      "status": "pending"
    }
  ],
  "txHashes": [
    "2QU1eWFjJCr...",
    "3RT2fXgkKDs..." // может быть несколько
  ]
}
```

### 4. **Логирование**

Все действия записываются в базу:
```sql
-- Основная запись
INSERT INTO withdrawal_records (
  withdrawal_id, address, symbol, amount, network,
  status, auto_approved, tx_hash, created_at
);

-- Логи действий
INSERT INTO withdrawal_logs (
  withdrawal_id, action, details, timestamp
);
```

### 5. **Проверка баланса (fire-and-forget)**

После отправки проверяется баланс кошелька:
```
GET /wallets/{chain}/{address}/balance
```
Ответ игнорируется (fire-and-forget).

## API Endpoints

### Process Withdrawal
```bash
POST /withdrawals/:id/process
```

Автоматически:
1. Проверяет лимиты
2. Вызывает refinanceTransfer
3. Логирует все txHash
4. Обновляет статус
5. Проверяет баланс

**Response:**
```json
{
  "success": true,
  "txHashes": ["2QU1eWFjJCr...", "3RT2fXgkKDs..."],
  "message": "Withdrawal processed with 2 transaction(s)"
}
```

## UI

### Withdrawals Tab

Каждый вывод имеет 2 кнопки:

1. **Auto Process** - автоматическая обработка через API
   - Проверяет лимиты
   - Отправляет через refinanceTransfer
   - Логирует результат

2. **Manual** - ручная обработка
   - Claim -> Complete с txHash
   - Для случаев когда нужен контроль

## Database Schema

### withdrawal_records
```sql
CREATE TABLE withdrawal_records (
  id INTEGER PRIMARY KEY,
  withdrawal_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  amount REAL NOT NULL,
  network TEXT NOT NULL,
  status TEXT NOT NULL, -- pending/auto_approved/manual_review/completed/failed
  auto_approved INTEGER DEFAULT 0,
  rejection_reason TEXT,
  tx_hash TEXT, -- может быть несколько через запятую
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER
);
```

### withdrawal_logs
```sql
CREATE TABLE withdrawal_logs (
  id INTEGER PRIMARY KEY,
  withdrawal_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
```

## Example Flow

### Успешный автовывод:
```
1. Exchange -> withdrawal_request (0.01 BTC)
2. Taker -> checkAutoApproval()
   - Amount: 0.01 <= 0.01 ✅
   - Cooldown: 2 min since last ✅
   - Duplicate: different amount ✅
3. Taker -> refinanceTransfer API
4. API -> { txHashes: ["abc123", "def456"] }
5. Taker -> DB: tx_hash = "abc123,def456"
6. Taker -> DB: status = "completed"
7. Taker -> Exchange: withdrawal_completed
8. Taker -> Balance check (fire-and-forget)
```

### Отклонен (cooldown):
```
1. Exchange -> withdrawal_request (0.01 BTC)
2. Taker -> checkAutoApproval()
   - Cooldown: 30 sec since last ❌
3. Taker -> DB: status = "manual_review"
   rejection_reason = "Cooldown: wait 30s"
4. UI -> Shows in Manual Review queue
```

## Configuration

### Network Mapping
```typescript
normalizeNetwork("erc20") -> "eth"
normalizeNetwork("trc20") -> "trx"
normalizeNetwork("bep20") -> "bsc"
normalizeNetwork("solana") -> "solana"
```

### Asset Mapping
```typescript
// Native coins = empty string
symbol === "SOL" -> asset: ""
symbol === "ETH" -> asset: ""
symbol === "BTC" -> asset: ""

// Tokens = symbol
symbol === "USDT" -> asset: "USDT"
symbol === "USDC" -> asset: "USDC"
```

## Error Handling

### API Errors
```typescript
try {
  const result = await refinanceTransfer(...);
} catch (error) {
  // Логируем в БД
  dbService.updateStatus(id, 'failed', false, error.message);
  dbService.log(id, 'error', error.message);
}
```

### Insufficient Balance
```json
{
  "transferredAmount": "0.005",
  "remainingAmount": "0.005",
  "walletsWithLiquidity": 0
}
```
→ Partial transfer, требует ручной проверки

## Monitoring

### Check Logs
```sql
-- Все выводы за последний час
SELECT * FROM withdrawal_records 
WHERE created_at > (strftime('%s', 'now') - 3600) * 1000;

-- Логи конкретного вывода
SELECT * FROM withdrawal_logs 
WHERE withdrawal_id = 123 
ORDER BY timestamp;

-- Статистика автоодобрения
SELECT 
  COUNT(*) as total,
  SUM(auto_approved) as auto,
  COUNT(*) - SUM(auto_approved) as manual
FROM withdrawal_records;
```

### API Endpoint
```bash
# История вывода
GET /withdrawals/123/history

# История адреса
GET /address/0x123.../history
```

## Security

1. **Rate Limiting**: 1 вывод в минуту с адреса
2. **Amount Limits**: Настраиваемые лимиты по символам
3. **Duplicate Detection**: Защита от повторных запросов
4. **Full Audit Trail**: Все действия в БД
5. **Manual Review Queue**: Подозрительные выводы

## Troubleshooting

### Вывод не обрабатывается
1. Проверить лимиты: `GET /limits`
2. Проверить логи: `GET /withdrawals/:id/history`
3. Проверить баланс кошельков в polygonmoneyflow

### API timeout
- Увеличить timeout в `withdrawal-processor.service.ts`
- Проверить доступность polygonmoneyflow API

### Multiple txHashes
- Нормально! `allowSplit: true` может создать несколько транзакций
- Все хеши логируются через запятую
- Первый хеш отправляется на exchange
