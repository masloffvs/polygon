#!/usr/bin/env bash
set -euo pipefail

WORKFLOW_FILE="${WORKFLOW_FILE:-deploy.yml}"
ENVIRONMENT="production"
IMAGE_TAG="$(git rev-parse HEAD 2>/dev/null || echo latest)"
REF="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo master)"
REPO="${GITHUB_REPOSITORY:-}"
WAIT_FOR_RUN=false

usage() {
    cat <<'EOF'
Usage:
  ./deploy.sh [options]

This script only triggers the GitHub Actions deploy workflow.

Options:
  --env <name>          GitHub Environment name (default: production)
  --tag <image-tag>     Docker image tag to deploy (default: current commit SHA)
  --ref <git-ref>       Git ref for workflow dispatch (default: current branch)
  --repo <owner/repo>   GitHub repository (auto-detected if omitted)
  --workflow <file>     Workflow filename (default: deploy.yml)
  --wait                Wait for started workflow run
  -h, --help            Show this help

Auth:
  Preferred: gh CLI (authenticated)
  Fallback:  GITHUB_TOKEN env var for GitHub API dispatch
EOF
}

detect_repo() {
    local remote_url
    remote_url="$(git config --get remote.origin.url || true)"

    if [[ -z "${remote_url}" ]]; then
        return 1
    fi

    if [[ "${remote_url}" =~ ^git@github\.com:([^/]+)/([^/]+)$ ]]; then
        echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
        return 0
    fi

    if [[ "${remote_url}" =~ ^https://github\.com/([^/]+)/([^/]+)$ ]]; then
        echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
        return 0
    fi

    return 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --env)
            ENVIRONMENT="${2:-}"
            shift 2
            ;;
        --tag)
            IMAGE_TAG="${2:-}"
            shift 2
            ;;
        --ref)
            REF="${2:-}"
            shift 2
            ;;
        --repo)
            REPO="${2:-}"
            shift 2
            ;;
        --workflow)
            WORKFLOW_FILE="${2:-}"
            shift 2
            ;;
        --wait)
            WAIT_FOR_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage
            exit 1
            ;;
    esac
done

if [[ -z "${REPO}" ]]; then
    REPO="$(detect_repo || true)"
fi

if [[ -z "${REPO}" ]]; then
    echo "Cannot detect GitHub repository. Pass --repo owner/repo." >&2
    exit 1
fi

if [[ -z "${ENVIRONMENT}" || -z "${IMAGE_TAG}" || -z "${REF}" ]]; then
    echo "--env, --tag, and --ref must not be empty." >&2
    exit 1
fi

echo "=========================================="
echo "Triggering deploy workflow"
echo "Repository : ${REPO}"
echo "Workflow   : ${WORKFLOW_FILE}"
echo "Environment: ${ENVIRONMENT}"
echo "Image tag  : ${IMAGE_TAG}"
echo "Ref        : ${REF}"
echo "=========================================="

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh workflow run "${WORKFLOW_FILE}" \
        --repo "${REPO}" \
        --ref "${REF}" \
        -f environment="${ENVIRONMENT}" \
        -f image_tag="${IMAGE_TAG}" \
        -f ref="${REF}"

    echo "Workflow dispatch sent via gh CLI."

    if [[ "${WAIT_FOR_RUN}" == true ]]; then
        sleep 2
        run_id="$(gh run list \
            --repo "${REPO}" \
            --workflow "${WORKFLOW_FILE}" \
            --event workflow_dispatch \
            --limit 1 \
            --json databaseId \
            --jq '.[0].databaseId')"

        if [[ -n "${run_id}" && "${run_id}" != "null" ]]; then
            echo "Watching run ${run_id}..."
            gh run watch "${run_id}" --repo "${REPO}"
        else
            echo "Run created, but run id could not be resolved for watch mode."
        fi
    fi

    exit 0
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    echo "No gh auth detected and GITHUB_TOKEN is not set." >&2
    echo "Authenticate gh CLI or export GITHUB_TOKEN." >&2
    exit 1
fi

api_url="${GITHUB_API_URL:-https://api.github.com}"
payload="$(printf '{"ref":"%s","inputs":{"environment":"%s","image_tag":"%s","ref":"%s"}}' \
    "${REF}" "${ENVIRONMENT}" "${IMAGE_TAG}" "${REF}")"

curl -sSfL \
    -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "${api_url}/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches" \
    -d "${payload}" >/dev/null

echo "Workflow dispatch sent via GitHub API."
if [[ "${WAIT_FOR_RUN}" == true ]]; then
    echo "--wait is supported only with authenticated gh CLI."
fi
