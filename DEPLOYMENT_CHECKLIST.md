# Deployment Checklist

## Before Deploying

- [ ] Copy `.env.extracted` to `.env` on production server
- [ ] Update any production-specific values in `.env`
- [ ] Create `src/polygonmoneyflow/.env` with wallet system config
- [ ] Verify all API keys are valid
- [ ] Change default passwords (Postgres, etc.)

## Deploy Command

```bash
./deploy.sh
```

## Post-Deployment

- [ ] Check all services are running: `docker compose ps`
- [ ] Check app logs: `docker compose logs app`
- [ ] Check wallet system logs: `docker compose logs wallet-api wallet-worker`
- [ ] Verify web interface: `http://192.168.1.223:81`
- [ ] Verify wallet API: `http://192.168.1.223:25960/health`

## Quick Commands

```bash
# View all logs
docker compose logs -f

# Restart specific service
docker compose restart app

# Check service status
docker compose ps

# Stop all services
docker compose down

# Start all services
docker compose up -d
```

## Files Changed

- ✅ `docker-compose.yml` - All secrets removed, using env_file
- ✅ `.env` - Updated with all required variables
- ✅ `.env.extracted` - Template with all secrets (DO NOT COMMIT)
- ✅ `.gitignore` - Added `.env.extracted`
- ✅ `ENV_SETUP.md` - Detailed setup instructions
- ✅ `deploy.sh` - SSH quiet mode enabled
- ✅ `Dockerfile` - Optimized with timeouts and retries
- ✅ `src/polygonmoneyflow/Dockerfile` - Fixed segfault issues
