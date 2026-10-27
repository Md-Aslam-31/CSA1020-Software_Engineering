#!/bin/sh
set -eu
set +x
registry_config="$(mktemp -d)"
export DOCKER_CONFIG="$registry_config"
trap 'docker logout >/dev/null 2>&1 || true; rm -rf "$registry_config"' EXIT HUP INT TERM
printf '%s' "$REGISTRY_TOKEN" | docker login --username "$REGISTRY_USER" --password-stdin >/dev/null 2>&1
docker push "$RELEASE_IMAGE"
docker image inspect "$RELEASE_IMAGE" --format '{{json .RepoDigests}}' > reports/image-digests.json
printf '%s\n' "$RELEASE_IMAGE" > reports/published-image.txt
