#!/usr/bin/env bash
set -euo pipefail

WORKFLOW_FILE="${WORKFLOW_FILE:-deploy.yml}"
BUILD_WORKFLOW_FILE="${BUILD_WORKFLOW_FILE:-build-images.yml}"
ENVIRONMENT="production"
IMAGE_TAG="$(git rev-parse HEAD 2>/dev/null || echo latest)"
REF="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo master)"
REPO="${GITHUB_REPOSITORY:-}"
WAIT_FOR_RUN=false
WAIT_FOR_BUILD=true

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
  --build-workflow <f>  Build workflow filename (default: build-images.yml)
  --no-wait-build       Do not wait for build workflow before deploy
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

resolve_ref_sha() {
    local repo="$1"
    local ref="$2"
    gh api "repos/${repo}/commits/${ref}" --jq '.sha'
}

wait_for_build_images() {
    local repo="$1"
    local build_workflow="$2"
    local head_sha="$3"

    local run_id
    local run_status
    local run_conclusion
    local attempts=0

    echo "Waiting for build workflow '${build_workflow}' on commit ${head_sha}..."

    while (( attempts < 60 )); do
        attempts=$((attempts + 1))

        run_id="$(gh run list \
            --repo "${repo}" \
            --workflow "${build_workflow}" \
            --limit 50 \
            --json databaseId,headSha \
            --jq "map(select(.headSha == \"${head_sha}\")) | sort_by(.databaseId) | last | .databaseId")"

        if [[ -z "${run_id}" || "${run_id}" == "null" ]]; then
            sleep 2
            continue
        fi

        run_status="$(gh run view "${run_id}" --repo "${repo}" --json status --jq '.status')"
        run_conclusion="$(gh run view "${run_id}" --repo "${repo}" --json conclusion --jq '.conclusion // ""')"

        if [[ "${run_status}" != "completed" ]]; then
            echo "Build run ${run_id} is '${run_status}'. Watching until completion..."
            gh run watch "${run_id}" --repo "${repo}" || true
            run_status="$(gh run view "${run_id}" --repo "${repo}" --json status --jq '.status')"
            run_conclusion="$(gh run view "${run_id}" --repo "${repo}" --json conclusion --jq '.conclusion // ""')"
        fi

        if [[ "${run_status}" == "completed" && "${run_conclusion}" == "success" ]]; then
            echo "Build run ${run_id} completed successfully."
            return 0
        fi

        if [[ "${run_status}" == "completed" ]]; then
            echo "Build run ${run_id} finished with conclusion: ${run_conclusion}" >&2
            return 1
        fi

        sleep 2
    done

    echo "Timed out waiting for build workflow '${build_workflow}' on ${head_sha}." >&2
    return 1
}

resolve_new_dispatch_run_id() {
    local repo="$1"
    local workflow_file="$2"
    local previous_id="$3"
    local head_sha="${4:-}"

    local run_id
    local jq_query

    if [[ -n "${head_sha}" ]]; then
        jq_query="map(select(.databaseId > ${previous_id} and .headSha == \"${head_sha}\")) | sort_by(.databaseId) | last | .databaseId"
    else
        jq_query="map(select(.databaseId > ${previous_id})) | sort_by(.databaseId) | last | .databaseId"
    fi

    for _ in {1..40}; do
        run_id="$(gh run list \
            --repo "${repo}" \
            --workflow "${workflow_file}" \
            --event workflow_dispatch \
            --limit 50 \
            --json databaseId,headSha \
            --jq "${jq_query}")"

        if [[ -n "${run_id}" && "${run_id}" != "null" ]]; then
            echo "${run_id}"
            return 0
        fi

        sleep 2
    done

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
        --build-workflow)
            BUILD_WORKFLOW_FILE="${2:-}"
            shift 2
            ;;
        --no-wait-build)
            WAIT_FOR_BUILD=false
            shift
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
    target_sha="$(resolve_ref_sha "${REPO}" "${REF}" 2>/dev/null || true)"

    if [[ -n "${target_sha}" && "${WAIT_FOR_BUILD}" == true && "${IMAGE_TAG}" == "${target_sha}" ]]; then
        wait_for_build_images "${REPO}" "${BUILD_WORKFLOW_FILE}" "${target_sha}"
    elif [[ "${WAIT_FOR_BUILD}" == true ]]; then
        echo "Skipping build wait (image tag '${IMAGE_TAG}' does not match ref SHA '${target_sha:-unknown}')."
    fi

    previous_dispatch_run_id="$(gh run list \
        --repo "${REPO}" \
        --workflow "${WORKFLOW_FILE}" \
        --event workflow_dispatch \
        --limit 1 \
        --json databaseId \
        --jq '.[0].databaseId // 0')"

    if [[ -z "${previous_dispatch_run_id}" || "${previous_dispatch_run_id}" == "null" ]]; then
        previous_dispatch_run_id=0
    fi

    gh workflow run "${WORKFLOW_FILE}" \
        --repo "${REPO}" \
        --ref "${REF}" \
        -f environment="${ENVIRONMENT}" \
        -f image_tag="${IMAGE_TAG}" \
        -f ref="${REF}"

    echo "Workflow dispatch sent via gh CLI."

    if [[ "${WAIT_FOR_RUN}" == true ]]; then
        run_id="$(resolve_new_dispatch_run_id \
            "${REPO}" \
            "${WORKFLOW_FILE}" \
            "${previous_dispatch_run_id}" \
            "${target_sha}" || true)"

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
