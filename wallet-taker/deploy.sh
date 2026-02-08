#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${DEPLOY_HOST:-john@192.168.1.223}"
REMOTE_DIR="${DEPLOY_DIR:-/home/john/polygon-wallet-taker}"
WEB_PORT="${WEB_PORT:-85}"
BACKEND_PORT="${BACKEND_PORT:-86}"
SYNC_ENV="${SYNC_ENV:-false}"
OPEN_FIREWALL="${OPEN_FIREWALL:-false}"

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required but not installed"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required but not installed"
  exit 1
fi

echo "Deploy target: ${REMOTE_HOST}:${REMOTE_DIR}"
echo "Ports: web=${WEB_PORT}, backend=${BACKEND_PORT}"

ssh "${REMOTE_HOST}" "mkdir -p \"${REMOTE_DIR}\" \"${REMOTE_DIR}/data\""

RSYNC_EXCLUDES=(
  --exclude ".git"
  --exclude "node_modules"
  --exclude "web/node_modules"
  --exclude "dist"
  --exclude "public"
  --exclude "data"
  --exclude "*.log"
)

if [[ "${SYNC_ENV}" != "true" ]]; then
  RSYNC_EXCLUDES+=(--exclude ".env")
fi

echo "Syncing project files..."
rsync -az --delete "${RSYNC_EXCLUDES[@]}" ./ "${REMOTE_HOST}:${REMOTE_DIR}/"

if [[ "${SYNC_ENV}" != "true" ]]; then
  echo "Checking remote .env..."
  ssh "${REMOTE_HOST}" "test -f \"${REMOTE_DIR}/.env\" || { echo 'Missing ${REMOTE_DIR}/.env (set SYNC_ENV=true to upload local .env)'; exit 1; }"
fi

if [[ "${OPEN_FIREWALL}" == "true" ]]; then
  echo "Opening firewall ports (ufw)..."
  ssh "${REMOTE_HOST}" "sudo ufw allow ${WEB_PORT}/tcp || true; sudo ufw allow ${BACKEND_PORT}/tcp || true"
fi

echo "Running docker compose on remote..."
ssh "${REMOTE_HOST}" "
  set -euo pipefail
  cd \"${REMOTE_DIR}\"
  export WEB_HOST_PORT=\"${WEB_PORT}\"
  export BACKEND_HOST_PORT=\"${BACKEND_PORT}\"
  docker compose up -d --build --remove-orphans
  docker compose ps
"

echo "Deployment complete."
echo "Web:     http://${REMOTE_HOST#*@}:${WEB_PORT}"
echo "Backend: http://${REMOTE_HOST#*@}:${BACKEND_PORT}"
