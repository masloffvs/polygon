# Wallet Taker v2.0

High-availability wallet taker client with ElysiaJS REST API and React Web Panel for exchange platform.

## 🚀 Features

- **WebSocket Connection**: Auto-reconnection with exponential backoff
- **REST API**: Full-featured ElysiaJS API with Swagger documentation
- **Web Panel**: Modern React UI with shadcn/ui components
- **Deposit Monitoring**: Automatic blockchain deposit detection
- **Withdrawal Management**: Interactive withdrawal processing
- **Balance Reporting**: Automated balance aggregation and reporting
- **Address Generation**: Real wallet address generation via polygonmoneyflow
- **Multi-chain Support**: Solana, Ethereum, Polygon, Bitcoin, XRP, and more

## 📦 Installation

```bash
bun install
```

## ⚙️ Configuration

Create a `.env` file:

```env
# Required
TAKER_TOKEN=your_token_here
URL_POLYGON_WALLET=http://localhost:8080

# WebSocket
TAKER_WS_URL=ws://localhost:3000/api/ws/tier/takerWallet
RECONNECT_DELAY=1000
MAX_RECONNECT_DELAY=30000
HEARTBEAT_INTERVAL=10000

# API Server
API_PORT=3001
API_HOST=0.0.0.0

# Balance Reporting
BALANCE_REPORT_INTERVAL_MS=30000

# Networks (comma-separated)
TAKER_DEPOSIT_NETWORKS=erc20,trc20,bep20,solana,bitcoin,xrp,polygon,arbitrum
TAKER_WITHDRAW_NETWORKS=erc20,trc20,bep20,solana,bitcoin,xrp,polygon,arbitrum

# Fees (JSON)
TAKER_FEES_JSON={"btc":"0.0001","erc20":"0.0005","solana":"0.01"}

# Balance Targets (JSON) - optional
TAKER_BALANCE_TARGETS_JSON=[{"chain":"solana","idOrAddress":"wallet_id","symbol":"SOL"}]

# Deposit Monitoring
DEPOSIT_POLL_INTERVAL_MS=15000
DEPOSIT_POLL_LIMIT=50

# Auto-simulate deposits (testing)
AUTO_SIMULATE_DEPOSIT=false
```

## 🏃 Running

### Запустить всё сразу (рекомендуется)

```bash
# Установите зависимости
bun install
cd web && bun install && cd ..

# Запустите backend + frontend одной командой
bun run dev:web+server
```

Откроются:
- Backend API: `http://localhost:3001`
- Web Panel: `http://localhost:3002`
- Swagger: `http://localhost:3001/swagger`

### Запустить раздельно

**Backend (API Server):**
```bash
bun run dev
```

**Frontend (Web Panel):**
```bash
bun run dev:web
```

### Production
```bash
# Build backend
bun run build
bun start

# Build frontend
bun run build:web
# Output will be in public/
```

## 🎨 Web Panel

Modern React interface with:
- Real-time status monitoring
- Balance tracking with USD values
- Withdrawal management (claim/complete/fail)
- Deposit simulator
- Deposit monitor with user lookup
- Beautiful UI with shadcn/ui + Tailwind CSS
- Responsive design

Access at: `http://localhost:3002`

## 📚 API Documentation

Once running, access Swagger docs at:
```
http://localhost:3001/swagger
```

### API Endpoints

#### Status
- `GET /` - API info
- `GET /health` - Health check
- `GET /status` - Connection status
- `GET /balances` - Current balances

#### Withdrawals
- `GET /withdrawals` - List pending withdrawals
- `POST /withdrawals/:id/claim` - Claim a withdrawal
- `POST /withdrawals/:id/complete` - Complete with tx hash
- `POST /withdrawals/:id/fail` - Mark as failed

#### Deposits
- `POST /deposits/simulate` - Simulate deposit (testing)

#### Monitoring
- `GET /monitor/status` - Deposit monitor status
- `GET /monitor/user/:userId` - Check user deposits

## 🎮 CLI Commands

Interactive console commands:

```bash
deposit <address> <symbol> <amount>  # Simulate deposit
withdrawals                          # List pending withdrawals
claim <id>                           # Claim a withdrawal
complete <id> <txHash>               # Complete withdrawal
fail <id> [reason]                   # Mark withdrawal as failed
networks                             # List supported networks
monitor                              # Show deposit monitor status
checkuser <userId>                   # Check deposits for user
status                               # Show connection status
api                                  # Show API info
exit                                 # Disconnect and exit
```

## 🏗️ Architecture

### Modular Structure

```
src/
├── api/                 # ElysiaJS REST API
│   └── index.ts
├── client/              # Main TakerClient orchestrator
│   └── index.ts
├── config/              # Configuration management
│   └── index.ts
├── services/            # Business logic services
│   ├── websocket.service.ts
│   ├── balance.service.ts
│   └── withdrawal.service.ts
├── deposit-monitor.ts   # Deposit monitoring
├── handlers.ts          # Wallet operation handlers
├── wallet-api.ts        # Wallet API client
├── logger.ts            # Logging
└── index.ts             # Entry point
```

### Key Components

1. **TakerClient**: Main orchestrator that coordinates all services
2. **WebSocketService**: Manages WebSocket connection and message routing
3. **BalanceService**: Handles balance aggregation and USD pricing
4. **WithdrawalService**: Manages withdrawal queue and processing
5. **DepositMonitor**: Polls blockchain for incoming transactions
6. **API Server**: ElysiaJS REST API for external control

## 🔄 Workflow

### Deposit Flow
1. User requests deposit address
2. Client generates real address via polygonmoneyflow
3. DepositMonitor polls for incoming transactions
4. Confirmed deposits are reported to exchange
5. Exchange credits user account

### Withdrawal Flow
1. Exchange broadcasts withdrawal request
2. Client adds to pending queue
3. Operator claims withdrawal via CLI/API
4. Operator processes on blockchain
5. Operator completes with tx hash via CLI/API

## 🧪 Testing

### Simulate Deposit
```bash
# CLI
deposit 0x123... USDT 100

# API
curl -X POST http://localhost:3001/deposits/simulate \
  -H "Content-Type: application/json" \
  -d '{"address":"0x123...","symbol":"USDT","amount":100}'
```

### Check Status
```bash
# CLI
status

# API
curl http://localhost:3001/status
```

## 🔐 Security

- Token-based authentication with exchange
- Secure WebSocket connection
- Environment variable configuration
- No private keys stored in client

## 📊 Monitoring

- Real-time connection status
- Deposit monitoring metrics
- Balance reporting
- Withdrawal queue tracking
- Comprehensive logging with pino

## 🛠️ Development

### Adding New Features

1. Create service in `src/services/`
2. Register in `TakerClient`
3. Add API endpoints in `src/api/`
4. Update configuration if needed

### Code Style

- TypeScript strict mode
- Modular architecture
- Service-oriented design
- Comprehensive error handling

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please follow the existing code structure and add tests for new features.
