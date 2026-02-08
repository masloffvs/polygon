# Auto-Withdrawal Limits System

## Overview

Система автоматического одобрения выводов с защитой от злоупотреблений и полным логированием в SQLite базу данных.

**Использует встроенный `bun:sqlite` - нативный SQLite движок Bun!**

## Features

### 1. **SQLite Database (bun:sqlite)**
- Встроенный SQLite движок Bun (быстрее чем better-sqlite3)
- Хранение истории всех выводов
- Логирование всех действий
- Настройки лимитов по символам
- WAL режим для производительности
- Путь к базе: `./data/withdrawals.db` (настраивается через `DATABASE_PATH`)

### 2. **Auto-Approval Rules**

Вывод автоматически одобряется если:
- ✅ Сумма не превышает лимит для символа
- ✅ Прошла минута с последнего вывода с этого адреса (cooldown)
- ✅ Сумма отличается от предыдущего вывода (защита от дублей)

Если хотя бы одно условие не выполнено → **Manual Review**

### 3. **Cooldown Protection**
- 1 адрес может запрашивать вывод **максимум 1 раз в минуту**
- Защита от спама и автоматических атак
- Логируется причина отклонения

### 4. **Duplicate Detection**
- Если предыдущий вывод с адреса был на **ту же сумму** → требуется ручная проверка
- Защита от повторных запросов (возможная ошибка или атака)
- Пример: 1 BTC → 1 BTC = manual review

### 5. **Configurable Limits**
- Настройка лимитов через UI (вкладка **Limits**)
- Включение/выключение автовывода по символу
- Дефолтные лимиты:
  - USDT: 1000
  - USDC: 1000
  - BTC: 0.01
  - ETH: 0.5

## Database Schema

### `withdrawal_records`
```sql
- id: INTEGER PRIMARY KEY
- withdrawal_id: INTEGER (ID из exchange)
- address: TEXT (адрес получателя)
- symbol: TEXT (монета)
- amount: REAL (сумма)
- network: TEXT (сеть)
- status: TEXT (pending/claimed/completed/failed/auto_approved/manual_review)
- auto_approved: INTEGER (0/1)
- rejection_reason: TEXT (причина отклонения)
- tx_hash: TEXT (хеш транзакции)
- created_at: INTEGER (timestamp)
- claimed_at: INTEGER
- completed_at: INTEGER
```

### `auto_limits`
```sql
- id: INTEGER PRIMARY KEY
- symbol: TEXT UNIQUE
- max_amount: REAL
- enabled: INTEGER (0/1)
- updated_at: INTEGER
```

### `withdrawal_logs`
```sql
- id: INTEGER PRIMARY KEY
- withdrawal_id: INTEGER
- action: TEXT (created/status_updated/tx_hash_set/etc)
- details: TEXT
- timestamp: INTEGER
```

## API Endpoints

### Get Limits
```bash
GET /limits
```
Response:
```json
{
  "limits": [
    {
      "id": 1,
      "symbol": "USDT",
      "max_amount": 1000,
      "enabled": true,
      "updated_at": 1707350400000
    }
  ],
  "stats": {
    "total": 150,
    "autoApproved": 120,
    "manualReview": 30,
    "completed": 145
  }
}
```

### Update Limit
```bash
POST /limits
Content-Type: application/json

{
  "symbol": "BTC",
  "maxAmount": 0.05,
  "enabled": true
}
```

### Get Withdrawal History
```bash
GET /withdrawals/:id/history
```

### Get Address History
```bash
GET /address/:address/history
```

## Usage Example

### 1. Настройка лимитов через UI
1. Открыть вкладку **Limits**
2. Изменить лимит для нужного символа
3. Включить/выключить автовывод

### 2. Проверка логов
```typescript
import { dbService } from './services/database.service';

// Получить логи конкретного вывода
const logs = dbService.getWithdrawalLogs(withdrawalId);

// Получить историю адреса
const history = dbService.getAddressHistory('0x123...', 10);

// Статистика
const stats = dbService.getStats();
```

### 3. Ручная проверка автоодобрения
```typescript
const approval = dbService.checkAutoApproval({
  address: '0x123...',
  symbol: 'BTC',
  amount: 0.02
});

if (approval.approved) {
  // Автоодобрено
} else {
  console.log(approval.reason); // Причина отклонения
}
```

## Logging

Все действия логируются:
- ✅ Создание запроса на вывод
- ✅ Проверка автоодобрения (approved/rejected + reason)
- ✅ Изменение статуса
- ✅ Установка tx_hash
- ✅ Обновление лимитов

Пример лога:
```
[Withdrawal 123] created: Withdrawal request created for 0.01 BTC
[Withdrawal 123] status_updated: Status changed to auto_approved
[Withdrawal 123] tx_hash_set: Transaction hash: 0xabc...
[Withdrawal 123] status_updated: Status changed to completed
```

## Security Features

1. **Rate Limiting**: 1 запрос в минуту с адреса
2. **Duplicate Detection**: Защита от повторных запросов
3. **Amount Limits**: Настраиваемые лимиты по символам
4. **Full Audit Trail**: Все действия в базе данных
5. **Manual Review Queue**: Подозрительные выводы требуют ручной проверки

## Configuration

### Environment Variables
```bash
# Database path
DATABASE_PATH=./data/withdrawals.db
```

### Default Limits
Можно изменить в `database.service.ts`:
```typescript
const defaultLimits = [
  { symbol: 'USDT', max_amount: 1000 },
  { symbol: 'USDC', max_amount: 1000 },
  { symbol: 'BTC', max_amount: 0.01 },
  { symbol: 'ETH', max_amount: 0.5 },
];
```

## Monitoring

### UI Stats
Вкладка **Limits** показывает:
- Total Withdrawals
- Auto-Approved
- Manual Review
- Completed

### Database Queries
```sql
-- Все автоодобренные выводы
SELECT * FROM withdrawal_records WHERE auto_approved = 1;

-- Выводы требующие ручной проверки
SELECT * FROM withdrawal_records WHERE status = 'manual_review';

-- Статистика по адресу
SELECT COUNT(*), SUM(amount) FROM withdrawal_records WHERE address = '0x123...';
```

## Troubleshooting

### Вывод не автоодобряется
1. Проверить лимит: `GET /limits`
2. Проверить историю адреса: `GET /address/:address/history`
3. Проверить логи: `GET /withdrawals/:id/history`

### База данных не создается
1. Проверить `DATABASE_PATH` в `.env`
2. Проверить права на запись в папку `./data`
3. Проверить логи сервера

### Cooldown не работает
- Проверить системное время
- Проверить записи в `withdrawal_records` для адреса
- Cooldown = 60 секунд с момента `created_at`
