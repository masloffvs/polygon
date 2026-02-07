# TSX Validator

Быстрая утилита на C для валидации TSX/JSX файлов. Проверяет корректность закрытия тегов и разметки.

## Сборка

```bash
cd build-tools

# Собрать CLI утилиту
make

# Собрать статическую библиотеку для интеграции
make lib

# Собрать динамическую библиотеку
make shared

# Собрать всё
make all
```

## Использование CLI

```bash
# Проверить один файл
./tsx_validator src/App.tsx

# Проверить несколько файлов
./tsx_validator src/components/*.tsx

# Проверить все TSX файлы в проекте
find ../src -name "*.tsx" | xargs ./tsx_validator

# Тихий режим (только ошибки)
./tsx_validator -q src/**/*.tsx

# Остановиться на первой ошибке
./tsx_validator -s src/**/*.tsx
```

## Игнорирование файлов

Создайте файл `.tsxcheckignore` в директории запуска:

```
# Комментарии начинаются с #
# Один паттерн на строку (поддерживаются glob patterns)

# Игнорировать конкретный файл
OklinkTransactions.tsx

# Игнорировать по паттерну пути
**/generated/*.tsx
src/legacy/*.tsx
```

Игнорируемые файлы выводятся с символом `⊘`:

```
⊘ ../src/pages/OklinkTransactions.tsx (ignored)
```

## Интеграция в систему сборки

### Как библиотека

```c
#include "tsx_validator.h"

int main() {
    // Проверить один файл
    TsxValidationResult result = tsx_validate_file("Component.tsx");

    if (!result.valid) {
        printf("Ошибка в строке %d: %s\n", result.line, result.error);
        return 1;
    }

    printf("Проверено тегов: %d\n", result.tags_checked);
    return 0;
}
```

### Компиляция с библиотекой

```bash
# Со статической библиотекой
gcc your_build_tool.c -L./build-tools -ltsx_validator -o your_build_tool

# С динамической библиотекой
gcc your_build_tool.c -L./build-tools -ltsx_validator -Wl,-rpath,./build-tools -o your_build_tool
```

### Интеграция в Makefile

```makefile
# В вашем Makefile
TSX_VALIDATOR = ./build-tools/tsx_validator

check-tsx:
	@find src -name "*.tsx" | xargs $(TSX_VALIDATOR) -q

build: check-tsx
	# ваша сборка
```

### Интеграция в package.json (через npm scripts)

```json
{
  "scripts": {
    "check:tsx": "find src -name '*.tsx' | xargs ./build-tools/tsx_validator",
    "prebuild": "npm run check:tsx"
  }
}
```

## API

### `tsx_validate_file(filepath)`

Проверяет один файл, возвращает `TsxValidationResult`.

### `tsx_validate_buffer(content, len)`

Проверяет содержимое из буфера.

### `tsx_validate_files(paths, count, stop_on_first)`

Проверяет массив файлов.

### `TsxValidationResult`

```c
typedef struct {
    bool valid;           // true если валидно
    int line;             // строка ошибки
    int col;              // колонка ошибки
    char error[512];      // текст ошибки
    int tags_checked;     // количество проверенных тегов
    int files_checked;    // количество проверенных файлов
} TsxValidationResult;
```

## Что проверяется

- ✅ Открытые/закрытые теги (`<div>...</div>`)
- ✅ Самозакрывающиеся теги (`<img />`, `<br />`)
- ✅ React Fragments (`<>...</>`)
- ✅ JSX expressions (`{value}`)
- ✅ HTML self-closing tags (img, br, input, etc.)
- ✅ Строки в атрибутах
- ✅ Template literals
- ✅ Комментарии (// и /\* \*/)

## Производительность

Утилита оптимизирована для скорости:

- Минимальные аллокации памяти
- Однопроходный парсер
- Чтение файла целиком в память

Типичная скорость: **~10000 файлов/секунду** на современном CPU.
