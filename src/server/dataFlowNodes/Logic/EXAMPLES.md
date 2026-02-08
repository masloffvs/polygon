# Logic Nodes - Примеры использования

## Пример 1: Фильтр крупных сделок Polymarket

Отфильтровать сделки больше $10,000 и отправить в Telegram:

```
┌─────────────────┐
│  SourceInput    │ (polymarket-ws-channel)
│  id: source-1   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ ObjectValueBetterThan   │
│ path: "amount"          │
│ threshold: 10000        │
│ orEqual: false          │
└────┬──────────┬─────────┘
     │          │
passed│          │failed
     │          └──→ [DebugLog: "Small trade"]
     ▼
┌─────────────────────────┐
│ TelegramTextMessage     │
│ text: "🐋 Large trade!" │
└────────┬────────────────┘
         │
         ▼
┌─────────────────┐
│ TelegramSend    │
└─────────────────┘
```

## Пример 2: Диапазон цен с уведомлением

Отслеживать BTC в диапазоне $90K-$100K:

```
┌─────────────────┐
│  SourceInput    │ (global-price-feed)
│  id: btc-price  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ ObjectValueInRange      │
│ path: "price"           │
│ min: 90000              │
│ max: 100000             │
│ inclusive: true         │
└────┬──────────┬─────────┘
     │          │
passed│          │failed
     │          └──→ [Skip]
     ▼
┌─────────────────────────┐
│ StringTemplate          │
│ "BTC in range: {{price}}"│
└────────┬────────────────┘
         │
         ▼
┌─────────────────┐
│ TelegramSend    │
└─────────────────┘
```

## Пример 3: Множественные условия (AND)

Фильтр: сделка > $5K И статус = "active":

```
┌─────────────────┐
│  SourceInput    │
└────┬───────┬────┘
     │       │
     │       └──────────────────┐
     │                          │
     ▼                          ▼
┌─────────────────────┐  ┌──────────────────┐
│ ObjectValueBetter   │  │ ObjectValueEquals│
│ path: "amount"      │  │ path: "status"   │
│ threshold: 5000     │  │ expected: "active"│
└────┬────────────────┘  └────┬─────────────┘
     │passed                  │passed
     │                        │
     └────────┬───────────────┘
              │
              ▼
       ┌──────────────┐
       │  LogicAnd    │
       │ input1, input2│
       └──────┬───────┘
              │result
              ▼
       ┌──────────────┐
       │ TelegramSend │
       └──────────────┘
```

## Пример 4: Каскадная проверка статусов

Маршрутизация по разным статусам:

```
┌─────────────────┐
│  SourceInput    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ ObjectValueEquals       │
│ path: "status"          │
│ expected: "completed"   │
└────┬──────────┬─────────┘
     │passed    │failed
     │          │
     ▼          ▼
[Process    ┌─────────────────────────┐
Completed]  │ ObjectValueEquals       │
            │ path: "status"          │
            │ expected: "pending"     │
            └────┬──────────┬─────────┘
                 │passed    │failed
                 │          │
                 ▼          ▼
            [Process    [Process
            Pending]    Other]
```

## Пример 5: Проверка наличия поля

Обработать только если есть email:

```
┌─────────────────┐
│  SourceInput    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ ObjectHasKey            │
│ path: "user.email"      │
│ checkNotNull: true      │
└────┬──────────┬─────────┘
     │passed    │failed
     │          │
     ▼          └──→ [DebugLog: "No email"]
┌─────────────────┐
│ ObjectGetKey    │
│ path: "user.email"│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Send Email      │
└─────────────────┘
```

## Пример 6: Комбинированный фильтр для whale alerts

Whale alert: сделка > $100K И категория = "crypto":

```
┌─────────────────────────┐
│  SourceInput            │
│  (whale-positions)      │
└────┬───────────┬────────┘
     │           │
     │           └────────────────────┐
     │                                │
     ▼                                ▼
┌─────────────────────┐      ┌──────────────────┐
│ ObjectValueBetter   │      │ ObjectValueEquals│
│ path: "valueUsd"    │      │ path: "category" │
│ threshold: 100000   │      │ expected: "crypto"│
└────┬────────────────┘      └────┬─────────────┘
     │passed                      │passed
     │                            │
     └────────┬───────────────────┘
              │
              ▼
       ┌──────────────┐
       │  LogicAnd    │
       └──────┬───────┘
              │
              ▼
       ┌──────────────────────┐
       │ StringTemplate       │
       │ "🐋 {{trader}}: ${{valueUsd}}"│
       └──────┬───────────────┘
              │
              ▼
       ┌──────────────┐
       │ TelegramSend │
       └──────────────┘
```

## Пример 7: Диапазон с разными действиями

Разные действия для разных диапазонов цен:

```
┌─────────────────┐
│  SourceInput    │
└────┬───────┬────┘
     │       │
     │       └──────────────────────────┐
     │                                  │
     ▼                                  ▼
┌─────────────────────┐      ┌─────────────────────┐
│ ObjectValueLessThan │      │ ObjectValueBetter   │
│ path: "price"       │      │ path: "price"       │
│ threshold: 50       │      │ threshold: 100      │
└────┬────────────────┘      └────┬────────────────┘
     │passed                      │passed
     │                            │
     ▼                            ▼
[Alert: Low]              [Alert: High]
```

## Советы по использованию

1. **Используйте lodash paths** для вложенных объектов:
   - `"price"` - простое поле
   - `"market.price"` - вложенный объект
   - `"trades[0].amount"` - массив

2. **Комбинируйте с другими блоками**:
   - `ObjectGetKey` - извлечь значение
   - `StringTemplate` - форматировать сообщение
   - `ToBool/ToNumber` - преобразовать тип

3. **Обрабатывайте ошибки**:
   - Подключайте `error` выход к `DebugLog`
   - Используйте `failed` для альтернативной логики

4. **LogicAnd для сложных условий**:
   - Объедините несколько проверок
   - Используйте `requireAll` для 3-4 условий

5. **Оптимизация**:
   - Ставьте самые частые фильтры первыми
   - Используйте `ObjectHasKey` перед `ObjectGetKey`
