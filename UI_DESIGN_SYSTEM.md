# UI Design System Specification

> Документация дизайн-системы проекта TelegramRouter

## Обзор

Проект использует **Tailwind CSS v4** с кастомной тёмной темой, React-компоненты и Framer Motion для анимаций. Дизайн построен на принципе "dark-first" с ретро-эстетикой.

---

## 1. Цветовая палитра

### 1.1 Основные цвета (Dark Scale)

Градация от светло-серого до абсолютного чёрного:

| Token | HEX | Описание |
|-------|-----|----------|
| `--color-dark-50` | `#3a3a3a` | Светло-графитовый |
| `--color-dark-100` | `#2e2e2e` | Мокрый асфальт |
| `--color-dark-200` | `#242424` | Плотный уголь |
| `--color-dark-300` | `#1b1b1b` | Свежий битум |
| `--color-dark-400` | `#141414` | Глубокий чёрный |
| `--color-dark-500` | `#0f0f0f` | Нейтральный базовый |
| `--color-dark-600` | `#0b0b0b` | Мягкая тень |
| `--color-dark-700` | `#070707` | Почти абсолютный чёрный |
| `--color-dark-800` | `#040404` | Ближе к бездне |
| `--color-dark-900` | `#010101` | Абсолютная тьма |
| `--color-dark` | `#0a0a0a` | Комфортный рабочий фон |

### 1.2 Семантические цвета (Status)

```typescript
const STATUS_COLORS = {
  success: "text-green-400 bg-green-500/20",
  error: "text-red-400 bg-red-500/20",
  warning: "text-yellow-400 bg-yellow-500/20",
  info: "text-blue-400 bg-blue-500/20",
  pending: "text-gray-400 bg-gray-500/20",
  active: "text-green-400 bg-green-500/20",
  inactive: "text-gray-400 bg-gray-500/20",
};
```

### 1.3 Цвета логов

| Уровень | Текст | Фон |
|---------|-------|-----|
| Error | `text-red-200` | `bg-red-500/15` |
| Warn | `text-yellow-200` | `bg-yellow-500/15` |
| Info | `text-blue-200` | `bg-blue-500/15` |
| Debug | `text-gray-200` | `bg-gray-500/15` |

### 1.4 Цвета операций

```typescript
const OPERATION_COLORS = {
  export: "text-yellow-400",   // #facc15
  restore: "text-cyan-400",    // #06b6d4
  create: "text-green-400",    // #22c55e
  update: "text-blue-400",     // #3b82f6
  delete: "text-red-400",      // #ef4444
};
```

### 1.5 Тональность (Tone)

```typescript
const toneToClass = {
  neutral: "text-white",
  positive: "text-green-400",
  negative: "text-red-400",
  warning: "text-orange-400",
  info: "text-blue-400",
  purple: "text-purple-400",
};
```

---

## 2. Типографика

### 2.1 Шрифты

| Назначение | Шрифт | Вес |
|------------|-------|-----|
| Primary | Google Sans, Work Sans, Helvetica Neue, Roboto | 400 |
| Decorative | Yellowtail | 400 (cursive) |
| Pixel | Pixelify Sans | 700 |
| Retro | BBH Sans Bartle | 400 |
| Handwriting | Playpen Sans | 100-800 |

### 2.2 Размеры текста

| Размер | Класс | Использование |
|--------|-------|---------------|
| 11px | `text-[11px]` | Мета-лейблы, uppercase |
| 12px | `text-xs` | Badges, captions |
| 13px | `text-[13px]` | Кнопки (md) |
| 14px | `text-sm` | Body text, labels |
| 16px | `text-base` | Основной текст |
| 20px | `text-xl` | Primary values |

### 2.3 CSS-классы шрифтов

```css
.yellowtail-regular {
  font-family: "Yellowtail", cursive;
  font-weight: 400;
}

.pixelify-sans-bold {
  font-family: "Pixelify Sans", sans-serif;
  font-weight: 700;
}

.bbh-sans-bartle-regular {
  font-family: "BBH Sans Bartle", sans-serif;
  font-weight: 400;
}
```

---

## 3. Spacing & Layout

### 3.1 Padding Scale

| Token | Класс | Значение |
|-------|-------|----------|
| none | `p-0` | 0px |
| sm | `p-3` | 12px |
| md | `p-4` | 16px |
| lg | `p-6` | 24px |

### 3.2 Border Radius

| Size | Класс | Значение |
|------|-------|----------|
| sm | `rounded-lg` | 8px |
| md | `rounded-xl` | 12px |
| lg | `rounded-2xl` | 16px |

### 3.3 Layout Patterns

- **Sidebar**: 64px (desktop), collapsible (mobile)
- **Gap**: `gap-2`, `gap-4` для flex/grid
- **Container**: max-width с responsive breakpoints

---

## 4. Компоненты

### 4.1 Card

Compound-компонент с подкомпонентами: Header, Body, Footer, Skeleton.

**Варианты:**
```typescript
type CardVariant = "subtle" | "solid" | "outline" | "ghost";

const variantToClass = {
  subtle: "bg-dark-400/30",
  solid: "bg-dark-500/60",
  outline: "bg-transparent",
  ghost: "bg-transparent",
};
```

**Размеры:**
```typescript
type CardSize = "sm" | "md" | "lg";
type CardPadding = "none" | "sm" | "md" | "lg";
```

### 4.2 MonoButton

Монохромная кнопка без брендовых цветов.

```typescript
type MonoButtonProps = {
  variant?: "solid" | "soft" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
};

// Стили вариантов
const variantCls = {
  solid: "bg-dark-600 text-white hover:bg-dark-500 active:bg-dark-400",
  soft: "bg-dark-700 text-gray-200 hover:bg-dark-600",
  outline: "bg-transparent text-gray-200 hover:bg-dark-700",
  ghost: "bg-transparent text-gray-300 hover:bg-dark-700",
};

// Размеры
const sizeCls = {
  sm: "px-2 py-1 text-[12px]",
  md: "px-3 py-1.5 text-[13px]",
  lg: "px-4 py-2 text-[14px]",
};
```

### 4.3 StatusBadge

```typescript
type StatusBadgeProps = {
  status: "success" | "error" | "warning" | "info" | "pending" | "inactive" | "active";
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  icon?: ReactNode;
};

// Размеры
const sizeStyles = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};
```

### 4.4 Tabs

Pill-style табы с активным состоянием.

```typescript
// Активный таб
"bg-white text-black"

// Неактивный таб
"bg-dark-700 text-gray-300 hover:bg-dark-600"
```

### 4.5 Modal

```typescript
type ModalProps = {
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
};
```

### 4.6 FormField

Поля форм с валидацией и тёмной темой.

**Базовые стили:**
```css
background-color: var(--color-dark-900);
border: 1px solid var(--color-dark-500);
border-radius: 8px;
padding: 8px 12px;
```

**Focus state:**
```css
border-color: #3b82f6; /* blue-500 */
box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
```

---

## 5. Эффекты и анимации

### 5.1 Framer Motion

```typescript
// Spring physics
const springConfig = {
  stiffness: 400,
  damping: 30,
};

// Reduced motion support
const prefersReducedMotion = useReducedMotion();
```

### 5.2 Glass Effects

```css
.glass-board {
  background: linear-gradient(
    to bottom right,
    rgba(20, 20, 25, 0.55),
    rgba(20, 20, 25, 0.35)
  );
  backdrop-filter: blur(16px) saturate(140%);
  border-left: 1px solid rgba(20, 20, 25, 0.45);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.glass-btn {
  background: rgba(20, 20, 25, 0.25);
  backdrop-filter: blur(8px) saturate(140%);
}
```

### 5.3 Retro Effects

```css
.retro-card {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.retro-title {
  letter-spacing: 0.4px;
  text-shadow: 0 0 6px rgba(59, 130, 246, 0.25);
}

/* Scanlines effect */
.retro-scan::after {
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.03),
    rgba(255, 255, 255, 0.03) 1px,
    transparent 1px,
    transparent 3px
  );
}
```

---

## 6. Scrollbars

```css
/* Dark theme scrollbar */
[data-theme="dark"] ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

[data-theme="dark"] ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}

/* Firefox */
[data-theme="dark"] * {
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

/* Auto-hide scrollbar */
.scrollbar-auto-hide::-webkit-scrollbar {
  width: 0px;
  transition: width 0.2s ease;
}

.scrollbar-auto-hide:hover::-webkit-scrollbar {
  width: 6px;
}
```

---

## 7. Иконки

Используется библиотека **Hugeicons** (@hugeicons/react).

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";

<HugeiconsIcon icon={Settings01Icon} size={18} />
```

---

## 8. Структура файлов

```
src/ui/
├── styles/
│   ├── app.css              # Entrypoint
│   ├── base.css             # Global styles, Tailwind import
│   ├── tailwind.theme.css   # Theme tokens
│   ├── forms-dark.css       # Form controls
│   ├── retro.css            # Retro utilities
│   └── colors.ts            # Color constants
├── components/
│   ├── Card/                # Compound component
│   ├── Modal/
│   ├── FormField/
│   ├── StatusBadge/
│   ├── Toast/
│   ├── TransTable/
│   ├── TransTree/
│   ├── charts/
│   ├── MonoButton.tsx
│   ├── Tabs.tsx
│   ├── LoadingSpinner.tsx
│   ├── StatCard.tsx
│   └── Empty.tsx
└── index.html               # Entry HTML
```

---

## 9. UX-архитектура: "Сотворение Адама"

### 9.1 Философия

UX в проекте построен на идеологии **use-хуков** — это ближе к функциональному React, чем к классовому наследованию. Базовые компоненты и хуки называются `Base<Component>` и располагаются в `src/ui/tools/base/`.

> "Сотворение Адама" — базовые компоненты дают жизнь всем остальным.

### 9.2 Базовые компоненты

```
src/ui/tools/
├── base.tsx              # BaseTool — корневой layout для инструментов
└── base/
    ├── hooks.ts          # Реэкспорт всех хуков
    ├── ToolModal.tsx     # Базовый модал с анимациями
    ├── useModal.ts       # Управление состоянием модала
    ├── useAsyncAction.ts # Async операции с loading/error
    ├── usePolling.ts     # Polling с автоочисткой
    ├── useFormModal.tsx  # Модал с формой
    ├── useMultiStageModal.ts # Многошаговые модалы
    ├── useCollectionTable.ts # Таблицы коллекций
    ├── useCreateModal.ts # Модал создания
    ├── ws.ts             # WebSocket router
    └── api.ts            # Axios instance
```

### 9.3 Ключевые use-хуки

#### useModal — управление модалами
```typescript
const editModal = useModal<User>();

// Открыть с данными
editModal.open(user);

// В JSX
<Modal isOpen={editModal.isOpen} onClose={editModal.close}>
  {editModal.data && <UserForm user={editModal.data} />}
</Modal>
```

#### useAsyncAction — async операции
```typescript
const { isLoading, error, execute, clearError } = useAsyncAction();

const handleSubmit = async () => {
  const result = await execute(async () => {
    const res = await fetch('/api/create', { method: 'POST', body: data });
    return res.json();
  });
  
  if (result.success) {
    console.log('Success!', result.data);
  }
};
```

#### usePolling — периодический fetch
```typescript
const { data, isLoading, error, refetch, stop, start } = usePolling(
  async () => {
    const res = await fetch('/api/stats');
    return res.json();
  },
  5000, // каждые 5 секунд
  { enabled: isActive, immediate: true }
);
```

#### useBackend — запросы к API
```typescript
const { response, isFirstLoading, fetchData, autofetch } = useBackend<Stats>(
  '/api/stats',
  'GET'
);

// Автообновление
autofetch(10000); // каждые 10 сек
```

#### useCollectionBackend — CRUD для коллекций
```typescript
const api = useCollectionBackend<User>('users');

await api.create({ name: 'John' });
await api.update(id, { name: 'Jane' });
await api.delete(id);
const { items } = await api.all();
const { items } = await api.search('john');
const { items, total, totalPages } = await api.paginate(1, 20);
```

### 9.4 BaseTool — корневой layout

```tsx
export default function BaseTool({
  children,
  title,
  include,      // Дополнительные элементы в header
  isLoading,
}: BaseToolProps) {
  return (
    <div className="w-full min-h-screen">
      <div className="p-4 text-white min-h-full mb-8 overflow-y-auto">
        {include}
        <h1 className="text-[28px] font-semibold yellowtail-regular h-10">
          {title}
        </h1>
        <div className="mt-4 pb-8">{children}</div>
      </div>
    </div>
  );
}
```

### 9.5 ToolModal — базовый модал

```tsx
<ToolModal
  title="Edit User"
  onClose={handleClose}
  confirmButton={{
    text: "Save",
    onClick: handleSave,
    disabled: !isValid,
  }}
  backButton={{ onClick: goBack }}
>
  <UserForm />
</ToolModal>
```

Особенности:
- Portal в `document.body`
- Framer Motion анимации (scale + opacity)
- Блокировка scroll body
- Suspense fallback с skeleton
- Accessibility: `role="dialog"`, `aria-modal`

### 9.6 Паттерн Connector

```typescript
interface ElementConnector {
  refresh: () => Promise<void>;
}

interface ElementWithConnectorProps<T extends ElementConnector> {
  connector?: (it: T) => void;
}
```

Позволяет родителю получить доступ к методам дочернего компонента.

### 9.7 Доменные хуки

Каждый инструмент имеет свои хуки в `hooks/`:

```
src/ui/tools/
├── TwinkTool/hooks/
│   ├── useTwinkData.ts
│   ├── useTwinkModals.ts
│   ├── useTwinkTelemetry.ts
│   └── useTwinkBulkOperations.ts
├── AdsTool/hooks/
│   └── useCampaignData.ts
├── CreativesTool/hooks/
│   ├── useCreatives.ts
│   ├── useCreativeFilters.ts
│   └── useBatchApi.ts
└── SonarTool/hooks/
    └── useSonar.ts
```

### 9.8 Принципы

1. **Composition over inheritance** — хуки вместо классов
2. **Single responsibility** — один хук = одна задача
3. **Memoization** — `useMemo`, `useCallback` для стабильных ссылок
4. **Cleanup** — все эффекты с очисткой (intervals, subscriptions)
5. **Type safety** — generics для типизации данных
6. **Reusability** — базовые хуки переиспользуются везде

---

## 10. Принципы дизайна

1. **Dark-first**: Все компоненты оптимизированы для тёмной темы
2. **Монохромность**: Основные элементы используют grayscale, цвет — для семантики
3. **Прозрачность**: Активное использование alpha-каналов (bg-color/20, bg-color/30)
4. **Минимализм**: Чистые линии, минимум декора
5. **Ретро-акценты**: Dashed borders, scanlines, text-shadow для атмосферы
6. **Accessibility**: Поддержка reduced motion, keyboard navigation, ARIA

---

## 11. Зависимости

```json
{
  "tailwindcss": "^4.1.18",
  "@tailwindcss/postcss": "^4.1.18",
  "framer-motion": "^12.23.26",
  "@hugeicons/react": "^1.1.4",
  "classnames": "^2.5.1"
}
```
