# AToken API (Rust MVP)

MVP блокчейна `AToken` с HTTP API:

- одноразовая эмиссия (`Mint`) только у эмитента,
- перевод конкретных `token_id`,
- получение метаданных/баланса/владельца токена,
- кошельки из приватного ключа,
- подпись блока по 3 предыдущим блокам.

## Запуск API

```bash
cargo run
```

По умолчанию сервер поднимется на `127.0.0.1:8080`.

Настройки:

- `ATOKEN_BIND` (пример: `0.0.0.0:8080`)
- `ATOKEN_CHAIN_ID` (пример: `AToken-mainnet`)

## Эндпоинты

- `GET /health`
- `POST /wallet/generate`
- `POST /wallet/from-private-key`
- `POST /issue`
- `POST /transfer`
- `GET /metadata`
- `GET /balance/:address`
- `GET /tokens/:address`
- `GET /owner/:token_id`
- `GET /chain`

## Быстрый сценарий (curl)

1. Генерация кошелька эмитента:

```bash
curl -s -X POST http://127.0.0.1:8080/wallet/generate
```

2. Эмиссия 100 токенов (один раз):

```bash
curl -s -X POST http://127.0.0.1:8080/issue \
  -H "content-type: application/json" \
  -d '{
    "issuer_private_key_hex": "YOUR_ISSUER_PRIVATE_KEY",
    "amount": 100,
    "metadata": {
      "name": "AToken",
      "symbol": "ATKN",
      "description": "Fixed supply token",
      "decimals": 0
    }
  }'
```

3. Перевод токенов:

```bash
curl -s -X POST http://127.0.0.1:8080/transfer \
  -H "content-type: application/json" \
  -d '{
    "from_private_key_hex": "SENDER_PRIVATE_KEY",
    "to_address": "RECEIVER_ADDRESS",
    "token_ids": [0, 1, 2]
  }'
```

4. Проверка баланса:

```bash
curl -s http://127.0.0.1:8080/balance/RECEIVER_ADDRESS
```

## Правила

- `Mint` можно выполнить только один раз.
- После `Mint` дополнительный выпуск запрещен.
- `Transfer` проверяет, что отправитель владеет каждым `token_id`.
- У каждой транзакции проверяется `nonce`.
- В блоке фиксируются:
  - `previous_hash`,
  - `previous_three_hashes`,
  - подпись proposer по `(chain_id, height, previous_three_hashes)`.

## ScyllaDB

Адаптер Scylla находится в `src/scylla_store.rs` и компилируется через feature:

```bash
cargo test --features scylla-store
```

## Важно

Это MVP. Для production нужны P2P, консенсус, mempool, политика таймингов и расширенные security-проверки.
