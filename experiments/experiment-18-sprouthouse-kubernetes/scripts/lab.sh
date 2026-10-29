#!/usr/bin/env bash
# Browser-only SproutHouse operator. It never deletes a cluster, PVC or dataset.
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
DATA_ROOT=${LAB_DATA_DIR:-/workspaces/.lab-data}
PRIVATE="$DATA_ROOT/private/sprouthouse-exp18"
TOOLS="$DATA_ROOT/tools"
KIND=${KIND_BIN:-$TOOLS/kind}
KUBECTL=${KUBECTL_BIN:-$TOOLS/kubectl}
CLUSTER=sprouthouse-exp18
NODE=sprouthouse-exp18-control-plane
NAMESPACE=sprouthouse-exp18
export KUBECONFIG="$PRIVATE/operator-kubeconfig"
die(){ printf 'Error: %s\n' "$*" >&2; exit 1; }
usage(){ cat <<'HELP'
SproutHouse • Experiment 18
  bash scripts/lab.sh start [--build]  Build/load images, create/resume cluster and deploy
  bash scripts/lab.sh status           Show real pods, services, deployments and PVCs
  bash scripts/lab.sh scale 1..6       Scale only the frontend and wait for readiness
  bash scripts/lab.sh stop             Stop the named cloud node; keep all database data
  bash scripts/lab.sh urls             Print the private application/dashboard links
  bash scripts/lab.sh dashboard-token Create a one-hour read-only fallback token privately

No cluster/PVC/data removal command is provided. Keep forwarded ports Private.
HELP
}
guard(){
  [[ ${CODESPACES:-false} == true && -n ${CODESPACE_NAME:-} ]] || die 'Use the GitHub Codespaces browser lab; local Docker is not required.'
  [[ $(uname -m) == x86_64 ]] || die 'This recorded lab uses Linux AMD64.'
  command -v docker >/dev/null || die 'Wait for the Codespaces Docker feature to finish starting.'
  docker info >/dev/null 2>&1 || die 'The cloud Docker daemon is not ready.'
  [[ -x "$KIND" && -x "$KUBECTL" ]] || die 'Pinned kind and kubectl must be installed under /workspaces/.lab-data/tools first.'
  mkdir -p "$PRIVATE"; chmod 700 "$PRIVATE"
}
k(){ "$KUBECTL" --context kind-$CLUSTER "$@"; }
wait_api(){
  local attempt
  for ((attempt=0;attempt<120;attempt++)); do
    if k --request-timeout=5s get --raw=/readyz >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  die 'The Kubernetes API did not become ready; inspect the named node logs.'
}
wait_http(){
  local port=$1 path=$2 successes=0 attempt
  for ((attempt=0;attempt<90;attempt++)); do
    if curl --silent --fail --max-time 5 "http://127.0.0.1:$port$path" >/dev/null; then
      successes=$((successes+1)); [[ $successes -lt 3 ]] || return 0
    else successes=0; fi
    sleep 2
  done
  die "Port $port did not become ready. Check the pod logs."
}
urls(){
  if [[ -n ${CODESPACE_NAME:-} ]]; then
    printf 'Application: https://%s-8180.%s/\nDashboard:   https://%s-8181.%s/c/SproutHouse-Lab/deployments?namespace=sprouthouse-exp18\n' "$CODESPACE_NAME" "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}" "$CODESPACE_NAME" "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  else printf 'Application: http://127.0.0.1:8180/\nDashboard:   http://127.0.0.1:8181/c/SproutHouse-Lab/deployments?namespace=sprouthouse-exp18\n'; fi
  printf 'Dashboard context: SproutHouse-Lab; namespace: sprouthouse-exp18. Both forwarded ports must stay Private.\n'
}
ensure_secret(){
  if k -n "$NAMESPACE" get secret sprouthouse-db-auth >/dev/null 2>&1; then
    printf 'Existing database Secret preserved.\n'
    return 0
  fi
  if [[ ! -s "$PRIVATE/database-password" ]] && k -n "$NAMESPACE" get pvc data-postgres-0 >/dev/null 2>&1; then
    die 'The database PVC exists but its Secret and private password backup are missing. Restore the original password before continuing.'
  fi
  SPROUTHOUSE_PRIVATE="$PRIVATE" python3 - <<'PY' | k apply -f -
import json,os,pathlib,secrets
path=pathlib.Path(os.environ['SPROUTHOUSE_PRIVATE'])/'database-password'
if not path.exists():
    descriptor=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(descriptor,'w') as target:target.write(secrets.token_urlsafe(36)+'\n')
password=path.read_text().strip()
assert len(password)>=32,'Private password backup is invalid'
print(json.dumps({'apiVersion':'v1','kind':'Secret','metadata':{'name':'sprouthouse-db-auth','namespace':'sprouthouse-exp18'},'type':'Opaque','stringData':{'password':password}}))
PY
}
status(){
  k get nodes
  k -n "$NAMESPACE" get deployments,statefulsets,pods,services,pvc -o wide
  printf '\nRecent project events:\n'
  k -n "$NAMESPACE" get events --sort-by=.lastTimestamp | tail -n 14
}
start(){
  local rebuild=${1:-}
  [[ -z "$rebuild" || "$rebuild" == --build ]] || die 'Only --build is supported after start.'
  for tier in frontend backend; do
    if [[ "$rebuild" == --build ]] || ! docker image inspect "sprouthouse-$tier:1.0.0" >/dev/null 2>&1; then
      docker build --tag "sprouthouse-$tier:1.0.0" "$ROOT/$tier"
    fi
  done
  if docker container inspect "$NODE" >/dev/null 2>&1; then
    docker start "$NODE" >/dev/null
  else
    "$KIND" create cluster --name "$CLUSTER" --config "$ROOT/cluster/kind-config.yaml" --wait 180s
  fi
  docker update --restart no "$NODE" >/dev/null
  "$KIND" export kubeconfig --name "$CLUSTER" --kubeconfig "$KUBECONFIG"
  wait_api
  "$KIND" load docker-image sprouthouse-frontend:1.0.0 sprouthouse-backend:1.0.0 --name "$CLUSTER"
  k apply -f "$ROOT/k8s/00-namespace.yaml"
  ensure_secret
  # Preserve a manually scaled frontend count when resuming the lab.
  local current_replicas
  current_replicas=$(k -n "$NAMESPACE" get deployment frontend -o jsonpath='{.spec.replicas}' 2>/dev/null || true)
  k apply -f "$ROOT/k8s/01-configmap.yaml" -f "$ROOT/k8s/02-database.yaml" -f "$ROOT/k8s/03-backend.yaml" -f "$ROOT/k8s/04-frontend.yaml" -f "$ROOT/k8s/05-dashboard-rbac.yaml" -f "$ROOT/k8s/06-dashboard.yaml"
  if [[ "$current_replicas" =~ ^[1-6]$ ]]; then k -n "$NAMESPACE" scale deployment/frontend --replicas="$current_replicas"; fi
  k -n "$NAMESPACE" rollout status statefulset/postgres --timeout=240s
  if [[ "$rebuild" == --build ]]; then
    k -n "$NAMESPACE" rollout restart deployment/backend deployment/frontend
  fi
  k -n "$NAMESPACE" rollout status deployment/backend --timeout=240s
  k -n "$NAMESPACE" rollout status deployment/frontend --timeout=180s
  k -n "$NAMESPACE" rollout status deployment/headlamp --timeout=240s
  wait_http 8180 /api/overview
  wait_http 8181 /
  printf '\nSproutHouse is ready. Database data remains on its retained PVC.\n'
  urls
  status
}
case "${1:-help}" in
  help|-h|--help) usage;;
  urls) urls;;
  start) guard; [[ $# -le 2 ]] || die 'Unexpected start arguments.';start "${2:-}";;
  status) guard;wait_api;status;;
  scale)
    guard;[[ $# == 2 && $2 =~ ^[1-6]$ ]] || die 'Choose an integer frontend replica count from 1 to 6.'
    wait_api;k -n "$NAMESPACE" scale deployment/frontend --replicas="$2"
    k -n "$NAMESPACE" rollout status deployment/frontend --timeout=180s
    k -n "$NAMESPACE" get deployment/frontend
    k -n "$NAMESPACE" get pods -l tier=frontend -o wide;;
  stop)
    guard
    if docker container inspect "$NODE" >/dev/null 2>&1; then docker stop --timeout 60 "$NODE" >/dev/null; fi
    printf 'Stopped only %s. Its images, PVC and saved data are retained.\n' "$NODE";;
  dashboard-token)
    guard;wait_api
    k -n "$NAMESPACE" create token sprouthouse-dashboard --duration=1h > "$PRIVATE/dashboard-token"
    chmod 600 "$PRIVATE/dashboard-token"
    printf 'One-hour read-only token saved privately to %s/dashboard-token; never include it in screenshots or Git.\n' "$PRIVATE";;
  *) usage;exit 1;;
esac
