# Logic Nodes

Логические блоки для условной маршрутизации данных в Data Studio.

## Блоки сравнения значений

### ObjectValueBetterThan (>)
Проверяет, что значение по ключу больше порога.
- **Входы**: `data` (объект)
- **Выходы**: `passed` (условие выполнено), `failed` (не выполнено), `value` (извлеченное значение), `error`
- **Настройки**:
  - `path` - путь к значению (lodash path: 'price', 'user.balance', 'items[0].amount')
  - `threshold` - пороговое значение
  - `orEqual` - разрешить равенство (>= вместо >)

**Пример**: Фильтровать сделки больше $1000
```
path: "amount"
threshold: 1000
orEqual: false
```

### ObjectValueLessThan (<)
Проверяет, что значение по ключу меньше порога.
- **Входы**: `data` (объект)
- **Выходы**: `passed`, `failed`, `value`, `error`
- **Настройки**:
  - `path` - путь к значению
  - `threshold` - пороговое значение
  - `orEqual` - разрешить равенство (<= вместо <)

**Пример**: Фильтровать низкие цены
```
path: "price"
threshold: 100
orEqual: true
```

### ObjectValueEquals (==)
Проверяет равенство значения ожидаемому.
- **Входы**: `data` (объект)
- **Выходы**: `passed`, `failed`, `value`, `error`
- **Настройки**:
  - `path` - путь к значению
  - `expectedValue` - ожидаемое значение
  - `compareType` - тип сравнения: "string", "number", "boolean"
  - `caseSensitive` - учитывать регистр (только для строк)

**Пример**: Фильтровать по статусу
```
path: "status"
expectedValue: "active"
compareType: "string"
caseSensitive: false
```

### ObjectValueInRange
Проверяет, что значение находится в диапазоне.
- **Входы**: `data` (объект)
- **Выходы**: `passed`, `failed`, `value`, `error`
- **Настройки**:
  - `path` - путь к значению
  - `min` - минимум (включительно)
  - `max` - максимум (включительно)
  - `inclusive` - включать границы (true: <=, false: <)

**Пример**: Фильтровать цены в диапазоне
```
path: "price"
min: 100
max: 1000
inclusive: true
```

## Блоки проверки структуры

### ObjectHasKey
Проверяет наличие ключа в объекте.
- **Входы**: `data` (объект)
- **Выходы**: `passed`, `failed`, `value`
- **Настройки**:
  - `path` - путь для проверки
  - `checkNotNull` - также проверить что значение не null/undefined

**Пример**: Проверить наличие email
```
path: "user.email"
checkNotNull: true
```

## Логические операторы

### LogicAnd
Ждет данные от всех входов (AND gate).
- **Входы**: `input1`, `input2`, `input3` (опц), `input4` (опц)
- **Выходы**: `result` (объект со всеми входами), `first` (первый вход)
- **Настройки**:
  - `requireAll` - требовать все 4 входа (иначе только input1 и input2)

**Пример**: Дождаться выполнения нескольких условий
```
requireAll: false  // Только input1 и input2 обязательны
```

## Использование lodash paths

Все блоки поддерживают lodash path синтаксис:
- `"name"` - простой ключ
- `"user.email"` - вложенный объект
- `"items[0].price"` - массив с индексом
- `"data.users[2].profile.age"` - сложный путь

## Примеры флоу

### Фильтр крупных сделок
```
[SourceInput] → [ObjectValueBetterThan] → [TelegramBotSender]
                      ↓ failed
                  [DebugLog]
```

### Проверка диапазона с уведомлением
```
[SourceInput] → [ObjectValueInRange] → [passed] → [TelegramTextMessage] → [Send]
                      ↓ failed
                  [DebugLog: "Out of range"]
```

### Множественные условия (AND)
```
[SourceInput] ──→ [ObjectValueBetterThan] ──→ [LogicAnd] → [Action]
              └─→ [ObjectHasKey] ──────────→ ┘
```

### Маршрутизация по статусу
```
[SourceInput] → [ObjectValueEquals] → [passed] → [ProcessActive]
                      ↓ failed
                  [ObjectValueEquals] → [passed] → [ProcessPending]
                      ↓ failed
                  [ProcessOther]
```
