# Environment Variables Setup

## Overview

All secrets and configuration have been extracted from `docker-compose.yml` into environment variables for better security and flexibility.

## Setup Instructions

### 1. Local Development

Copy `.env.extracted` to `.env`:
```bash
cp .env.extracted .env
```

Edit `.env` with your local values if needed.

### 2. Production Deployment

On the production server, create `.env` file:
```bash
cd ~/polygon-web
nano .env
```

Copy the contents from `.env.extracted` and update values as needed:
- API keys should remain the same
- Service URLs are already configured for Docker internal network
- Wallet system credentials can be changed for production

### 3. Wallet System (polygonmoneyflow)

The wallet system has its own `.env` file. Create it:
```bash
cd ~/polygon-web/src/polygonmoneyflow
nano .env
```

Required variables:
```env
POSTGRES_HOST=wallet-postgres
POSTGRES_DB=wallets
POSTGRES_USER=wallet
POSTGRES_PASSWORD=<change-in-production>
REDIS_HOST=wallet-redis

# Add any chain-specific RPC URLs here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.org
ETHEREUM_RPC_URL=https://eth.llamarpc.com
# etc...
```

## Environment Variables Reference

### API Keys
- `CBS_SPORTS_ACCESS_TOKEN` - CBS Sports API access
- `OPENROUTER_API_KEY` - OpenRouter AI API
- `OPENAI_API_KEY` - OpenAI API (same as OpenRouter)
- `MASSIVE_API_KEY` - Massive API access
- `NEWS_API_KEYS` - News API keys

### Service URLs (Docker Internal)
- `EMUFETCH_URL` - Emulator fetch service
- `REDIS_URL` - Redis connection
- `MONGODB_URL` - MongoDB connection
- `WALLET_GATEWAY_URL` - Wallet gateway API

### Database Configuration
- `CLICKHOUSE_URL` - ClickHouse HTTP endpoint
- `CLICKHOUSE_DB` - Database name
- `CLICKHOUSE_USER` - Username
- `CLICKHOUSE_PASSWORD` - Password (empty by default)
- `QDRANT_URL` - Qdrant vector DB endpoint

### Arbscanner Configuration
- `MIN_SPREAD_PERCENT` - Minimum spread to detect (4.8%)
- `MAX_SPREAD_PERCENT` - Maximum spread to detect (10.0%)
- `COOLDOWN_MS` - Cooldown between alerts (30000ms)
- `CALLBACK_URL` - Webhook URL for alerts
- `ENABLED_EXCHANGES` - Comma-separated exchange list
- `RUST_LOG` - Rust logging level

### Wallet System
- `POSTGRES_DB` - Wallet database name
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_HOST` - Database host
- `REDIS_HOST` - Redis host

### Other
- `NODE_ENV` - Environment (production/development)
- `ENABLE_VNC` - Enable VNC for debugging (true/false)

## Security Notes

1. **Never commit `.env` or `.env.extracted` to git** - They are in `.gitignore`
2. **Change default passwords in production** - Especially for Postgres
3. **Rotate API keys regularly** - Update in `.env` and restart services
4. **Use secrets management** - Consider using Docker secrets or Vault for production

## Updating Configuration

After changing `.env`:
```bash
# Restart all services
docker compose down
docker compose up -d

# Or restart specific service
docker compose restart app
```

## Troubleshooting

### Service can't connect to database
- Check that service URLs use Docker internal network names (e.g., `wallet-postgres`, not `localhost`)
- Verify all services are in the same Docker network

### Missing environment variables
- Check that `.env` file exists in the project root
- Verify `env_file: - .env` is present in docker-compose.yml for the service
- Check for typos in variable names

### Wallet system issues
- Ensure `src/polygonmoneyflow/.env` exists with correct values
- Check that `POSTGRES_HOST` and `REDIS_HOST` point to Docker service names
