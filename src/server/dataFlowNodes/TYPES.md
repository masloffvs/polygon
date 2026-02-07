# Data Flow Node Types

Система типизированных портов для обеспечения совместимости между нодами.

## Базовые типы

| Тип       | Описание                    | Цвет UI    |
| --------- | --------------------------- | ---------- |
| `string`  | Строка                      | 🔵 синий   |
| `number`  | Число                       | 🟣 фиолет  |
| `boolean` | true/false                  | 🟢 зелёный |
| `object`  | Любой объект                | 🟠 оранж   |
| `array`   | Массив                      | 🩷 розовый |
| `signal`  | Пустой триггер (без данных) | 🟡 жёлтый  |
| `binary`  | Stream/Buffer               | 🩵 бирюза  |
| `any`     | Принимает что угодно        | ⚪ серый   |

## Типизированные типы (typed:\*)

Формат: `typed:<category>/<subtype>`

### Media типы

```json
{ "type": "typed:image" }      // TypedImage object
{ "type": "typed:video" }      // Video data
{ "type": "typed:audio" }      // Audio data
{ "type": "typed:document" }   // Document/file
```

### Telegram типы

```json
{ "type": "typed:telegram/message-request" }   // Базовый - принимает любое сообщение
{ "type": "typed:telegram/text-message" }      // Только текст
{ "type": "typed:telegram/image-message" }     // Только фото
{ "type": "typed:telegram/document-message" }  // Только документ
{ "type": "typed:telegram/send-result" }       // Результат отправки
```

### Market типы

```json
{ "type": "typed:market/price-tick" }  // Тик цены
{ "type": "typed:market/orderbook" }   // Стакан
{ "type": "typed:market/trade" }       // Сделка
```

## Правила совместимости

### 1. `any` совместим со всем

```
any → string ✅
number → any ✅
typed:image → any ✅
```

### 2. Одинаковые типы совместимы

```
string → string ✅
typed:image → typed:image ✅
```

### 3. `typed:*` → `object` (backwards compat)

```
typed:image → object ✅
typed:telegram/text-message → object ✅
```

### 4. Наследование в категории

```
typed:telegram/image-message → typed:telegram/message-request ✅
typed:telegram/text-message → typed:telegram/message-request ✅
```

### 5. Несовместимые типы

```
string → number ❌
typed:image → string ❌
typed:telegram/text-message → typed:telegram/image-message ❌
```

## Определение портов в schema.json

### Input порт

```json
{
  "ports": {
    "inputs": [
      {
        "name": "image",
        "type": "typed:image",
        "description": "Image to process",
        "required": true
      },
      {
        "name": "caption",
        "type": "string",
        "description": "Optional caption",
        "required": false
      }
    ]
  }
}
```

### Output порт

```json
{
  "ports": {
    "outputs": [
      {
        "name": "message",
        "type": "typed:telegram/image-message",
        "description": "Ready to send message"
      },
      {
        "name": "error",
        "type": "object",
        "description": "Error if failed"
      }
    ]
  }
}
```

## TypeScript интерфейсы

Все типы определены в `src/server/dataflow/types.ts`:

### TypedImage

```typescript
interface TypedImage {
  data: string; // Base64 без prefix
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  width?: number;
  height?: number;
  filename?: string;
  size?: number;
}
```

### TelegramMessageRequest (базовый)

```typescript
interface TelegramMessageRequest {
  type:
    | "text"
    | "photo"
    | "document"
    | "video"
    | "audio"
    | "animation"
    | "sticker";
  chatId?: string | number;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  silent?: boolean;
  replyToMessageId?: number;
  protectContent?: boolean;
}
```

### TelegramTextMessage

```typescript
interface TelegramTextMessage extends TelegramMessageRequest {
  type: "text";
  text: string;
  disableWebPagePreview?: boolean;
}
```

### TelegramImageMessage

```typescript
interface TelegramImageMessage extends TelegramMessageRequest {
  type: "photo";
  photo: TypedImage | string; // TypedImage или URL
  caption?: string;
  hasSpoiler?: boolean;
}
```

### TelegramSendResult

```typescript
interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  chatId?: number | string;
  timestamp?: number;
  error?: string;
  errorCode?: number;
}
```

## Type Guards

```typescript
import { isTypedImage, isTelegramMessageRequest } from "../dataflow/types";

// В process():
if (isTypedImage(input.value)) {
  // input.value is TypedImage
}

if (isTelegramMessageRequest(input.value)) {
  // input.value is TelegramMessageRequest
}
```

## Создание нового typed типа

### 1. Добавь константу в types.ts

```typescript
export const TYPED_DATA_TYPES = {
  // ... existing
  MY_CUSTOM_TYPE: "typed:myapp/custom-data" as const,
};
```

### 2. Создай интерфейс

```typescript
export interface MyCustomData {
  id: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
```

### 3. Создай type guard

```typescript
export function isMyCustomData(value: unknown): value is MyCustomData {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "payload" in value
  );
}
```

### 4. Добавь цвет в portTypes.ts (UI)

```typescript
// src/pages/datastudio/utils/portTypes.ts
export function getTypeColor(type: DataType): string {
  // ... existing
  if (type.startsWith("typed:myapp")) return "#your-color";
  // ...
}
```

### 5. Используй в schema.json

```json
{
  "ports": {
    "outputs": [
      {
        "name": "data",
        "type": "typed:myapp/custom-data",
        "description": "My custom data output"
      }
    ]
  }
}
```

## Пример флоу

```
┌─────────────┐         ┌──────────────────────┐         ┌────────────────────┐
│   Imagen    │─image──▶│ Telegram Image Msg   │─message─▶│ Telegram Bot Send  │
│             │         │                      │         │                    │
└─────────────┘         │     ▲                │         └────────────────────┘
                        │     │ caption        │                   │
                        │     │                │                   ▼
┌─────────────┐         │     │                │         ┌────────────────────┐
│  ToString   │─result──┴─────┘                │         │     result         │
│             │                                │         │ typed:telegram/    │
└─────────────┘                                │         │   send-result      │
                                               │         └────────────────────┘
Port types:
- Imagen.image: typed:image
- ToString.result: string
- TelegramImageMsg.message: typed:telegram/image-message
- TelegramBotSend.message: typed:telegram/message-request ← accepts image-message!
- TelegramBotSend.result: typed:telegram/send-result
```
