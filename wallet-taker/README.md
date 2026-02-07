# Wallet Taker Client

High-availability wallet taker client for the exchange platform. Connects to the exchange via WebSocket and handles wallet operations.

## Features

- Persistent WebSocket connection with auto-reconnect
- Token-based authentication (validator token)
- Heartbeat/ping-pong for connection health
- Graceful shutdown handling
- Configurable via environment variables

## Setup

1. Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

2. Get your validator token from the operator panel at `/operator/takerValidator`

3. Set the token in your `.env` file

## Running

```bash
# Development
bun run dev

# Production
bun run build
bun run start
```

## Configuration

| Variable              | Description                         | Default                                       |
| --------------------- | ----------------------------------- | --------------------------------------------- |
| `TAKER_WS_URL`        | WebSocket endpoint                  | `ws://localhost:3000/api/ws/tier/takerWallet` |
| `TAKER_TOKEN`         | Validator token from operator panel | Required                                      |
| `RECONNECT_DELAY`     | Initial reconnect delay (ms)        | `1000`                                        |
| `MAX_RECONNECT_DELAY` | Maximum reconnect delay (ms)        | `30000`                                       |
| `HEARTBEAT_INTERVAL`  | Heartbeat interval (ms)             | `10000`                                       |
| `BALANCE_REPORT_INTERVAL_MS` | Balance report interval (ms) | `30000` |
| `TAKER_DEPOSIT_NETWORKS` | Comma-separated deposit networks | `erc20,trc20,bep20,...` |
| `TAKER_WITHDRAW_NETWORKS` | Comma-separated withdraw networks | `erc20,trc20,bep20,...` |
| `TAKER_FEES_JSON` | JSON fees map by network/symbol | See `.env.example` |
| `TAKER_BALANCE_TARGETS_JSON` | JSON array of balance targets (`chain`, `idOrAddress`, optional `symbol`, `asset`) | `[]` |
| `TAKER_USD_PRICE_OVERRIDES_JSON` | Optional USD price overrides JSON | `{}` |

## Protocol

### Connection Flow

1. Connect to WebSocket
2. Server sends `handshake_init`
3. Client sends `{ type: "handshake", token: "your_token" }`
4. Server validates and sends `handshake_complete`
5. Client sends `capabilities`
6. Client sends `balance_report` every 30s
7. Maintain connection with heartbeats

### Message Types

**From Server:**

- `handshake_init` - Initial connection, waiting for token
- `handshake_complete` - Successfully authenticated
- `handshake_error` - Invalid token
- `ping` - Health check
- `deposit_request` - New deposit to process
- `withdrawal_request` - Withdrawal to process
- `capabilities_ack` - Capabilities accepted/rejected
- `balance_report_ack` - Balance report accepted/rejected

**To Server:**

- `handshake` - Send validator token
- `pong` - Response to ping
- `heartbeat` - Active health check
- `capabilities` - Supported networks and taker fees
- `balance_report` - Periodic balances with USD estimates
- `deposit_confirmed` - Deposit processed
- `withdrawal_processed` - Withdrawal completed

## Extending

Add your wallet processing logic in `src/handlers/`:

```typescript
// src/handlers/deposit.ts
export async function processDeposit(data: DepositRequest) {
  // Your blockchain/wallet logic here
  // Return confirmation with txHash
}
```
