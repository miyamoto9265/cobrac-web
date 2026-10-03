#!/usr/bin/env bash
# Builds the worker image and runs packages/worker/test/image/isolation-check.mjs in it as PID 1 with sentinel
# secrets: the agent's command must not reach the API key or the task role's credentials URI, and Codex turns must
# still run. Needs Docker; no AWS access. Usage: scripts/worker-image-check.sh [image tag]
set -euo pipefail
cd "$(dirname "$0")/.."
image="${1:-cobrac-worker:image-check}"
docker build -f packages/worker/Dockerfile -t "$image" .
nonce="$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
docker run --rm \
  -e AWS_CONTAINER_CREDENTIALS_RELATIVE_URI="/v2/credentials/image-check-$nonce" \
  -e NCBI_API_KEY="ncbi-image-check-$nonce" \
  -e TABLE_USERS=x -e TABLE_PROJECTS=x -e TABLE_JOBS=x -e TABLE_MESSAGES=x -e ARTIFACTS_BUCKET=x \
  -e JOB_USER_ID=image-check -e JOB_PROJECT_ID=imagechk-1 -e JOB_ID=image-check \
  -v "$PWD/packages/worker/test/image:/check:ro" \
  "$image" node /check/isolation-check.mjs
