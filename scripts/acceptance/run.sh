#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
image="pi-account-switcher-acceptance:$$"
trap 'docker image rm "$image" >/dev/null 2>&1 || true' EXIT
# Only dependency fetching/building has network access. No host mounts are used.
docker build -f scripts/acceptance/Dockerfile -t "$image" .
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges "$image" "$@"
