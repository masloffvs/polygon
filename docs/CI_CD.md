# CI/CD Pipeline

## Overview
- `ci.yml`: validates code (`bun install`, TSX validator, frontend build check).
- `build-images.yml`: builds and pushes images to `ghcr.io/<owner>/<repo>/<service>:<tag>`.
- `deploy.yml`: deploys prebuilt images to remote host via SSH and `docker compose`.
- `deploy.sh`: only triggers `deploy.yml` (no local build/sync/deploy logic).

## Required GitHub Secrets
- `DEPLOY_HOST`: remote host/IP.
- `DEPLOY_USER`: SSH username.
- `DEPLOY_TARGET_DIR`: target directory on server (for example `~/polygon-web`).
- `DEPLOY_SSH_KEY`: private key used by Actions runner.

## Optional GitHub Secrets
- `DEPLOY_PORT`: SSH port (defaults to `22`).
- `APP_ENV_FILE`: multiline `.env` content for app/runtime vars.
- `WALLET_ENV_FILE`: multiline `.env` content for wallet services.
- `GHCR_USERNAME`: required only when GHCR images are private.
- `GHCR_TOKEN`: required only when GHCR images are private (`read:packages`).

## Server prerequisites
- Docker Engine + Docker Compose plugin installed.
- If GHCR images are private, host must be able to `docker login ghcr.io`.

## Runner requirement for LAN deployment
- `deploy.yml` runs on a self-hosted runner with labels: `self-hosted`, `linux`, `x64`.
- Install that runner on a machine that can reach `192.168.1.223:22`.

## Typical flow
1. Push to `main`/`master`.
2. `build-images.yml` publishes images tagged by commit SHA.
3. Run:

```bash
./deploy.sh --env production --tag <commit_sha> --ref master --wait
```

## Notes
- Production deploy uses `docker-compose.yml` + `docker-compose.prod.yml`.
- Wallet env file path is controlled through `WALLET_ENV_FILE`.
- Infra files synced by deploy workflow: `docker-compose*.yml`, `nginx/`, `clickhouse/`.
