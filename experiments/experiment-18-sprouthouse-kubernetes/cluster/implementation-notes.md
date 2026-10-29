# SproutHouse infrastructure notes

The deployment has three application tiers: Nginx frontend pods, two Flask API pods and one PostgreSQL StatefulSet pod. Headlamp is a separate operational dashboard. Scaling the frontend changes its Deployment only; API pods and the database keep their identities and data.

## Addresses and storage

- Cluster/context: `sprouthouse-exp18` / `kind-sprouthouse-exp18`.
- Namespace: `sprouthouse-exp18`.
- Frontend: NodePort `30180`, mapped to Codespaces loopback port `8180`.
- Headlamp: NodePort `30181`, mapped to Codespaces loopback port `8181`.
- Backend: internal `backend:8000`; database: internal `postgres:5432`.
- PostgreSQL's `data-postgres-0` PVC requests `512Mi` from kind's default `standard` StorageClass. The StatefulSet explicitly retains claims on deletion and scaling.
- `scripts/lab.sh stop` stops the cloud node without deleting the node, cluster or PVC. No destructive cleanup command is included.

The launcher's operator kubeconfig and generated database password are stored privately in `/workspaces/.lab-data/private/sprouthouse-exp18`, outside the source repository. A resumed deployment preserves its existing database Secret. A missing Secret/password with an existing PVC stops the launcher for recovery rather than replacing the database credentials.

## Actual dashboard and access boundary

Headlamp `v0.46.0` is a maintained Kubernetes UI; the original Kubernetes Dashboard project is archived. This deployment does not imitate the dashboard with custom charts.

Headlamp loads a kubeconfig context named `SproutHouse-Lab` in normal kubeconfig mode. The kubeconfig is a non-secret ConfigMap containing paths to Kubernetes' projected service-account token and CA certificate. The kubelet rotates that token; it never appears in the YAML source, a browser field, the project report or a screenshot. The dashboard's service account can only read project workloads and a small set of cluster navigation/storage metadata. It cannot read Secrets, modify resources, execute into pods or access workloads in other namespaces. The application pods do not receive a Kubernetes service-account token.

The web access boundary is the **private GitHub Codespaces forwarded port**. Keep ports `8180` and `8181` private. Everyone permitted to access this private dashboard sees the same restricted service-account view. This is a private teaching lab, not a shared public administration endpoint. No `cluster-admin` binding, `-insecure-ssl`, `-dev`, `-in-cluster` authentication shortcut or `-unsafe-use-service-account-token` flag is used.

Headlamp uses a read-only root filesystem. An init container copies its static frontend into a writable `emptyDir`, because Headlamp prepares its frontend index on startup. The dashboard and API use UID `10001`; Nginx uses UID `101`; the PostgreSQL Alpine image uses its documented UID/GID `70`.

If an operator needs a short-lived fallback token for an explicit token-login workflow, `scripts/lab.sh dashboard-token` saves a one-hour token privately without printing it. The normal kubeconfig-based dashboard does not require that fallback.

## Monitoring and scaling

```bash
bash scripts/lab.sh status
export KUBECONFIG=/workspaces/.lab-data/private/sprouthouse-exp18/operator-kubeconfig
KUBECTL=/workspaces/.lab-data/tools/kubectl
"$KUBECTL" --context kind-sprouthouse-exp18 -n sprouthouse-exp18 get pods,services,pvc -o wide
"$KUBECTL" --context kind-sprouthouse-exp18 -n sprouthouse-exp18 scale deployment/frontend --replicas=3
"$KUBECTL" --context kind-sprouthouse-exp18 -n sprouthouse-exp18 rollout status deployment/frontend
python3 scripts/load-check.py --expect-pods 3 --output evidence/load-after-scaling.json
```

The launcher's `KUBECONFIG` points to the private operator file. For an independent terminal, set `export KUBECONFIG=/workspaces/.lab-data/private/sprouthouse-exp18/operator-kubeconfig` before the explicit `kubectl` commands.

The bounded load check sends 120 real HTTP requests, records HTTP success and observed frontend pod names, and measures response latency. It demonstrates service traffic reaching three replicas; it is not a production load-capacity claim. CPU graphs are not fabricated: this lab does not require a metrics-server or Prometheus installation. Pod readiness, services, replica counts, volumes and events come from Kubernetes itself.

## Primary references checked on 28 October 2026

- [Kubernetes Dashboard status and Headlamp recommendation](https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/)
- [Headlamp in-cluster and kubeconfig installation](https://headlamp.dev/docs/latest/installation/in-cluster/)
- [Headlamp 0.46.0 release](https://github.com/kubernetes-sigs/headlamp/releases/tag/v0.46.0)
- [Headlamp kubeconfig client/proxy implementation](https://github.com/kubernetes-sigs/headlamp/blob/v0.46.0/backend/pkg/kubeconfig/kubeconfig.go)
- [Official PostgreSQL Alpine image and UID/GID](https://github.com/docker-library/postgres/blob/master/16/alpine3.24/Dockerfile)
- [StatefulSet persistent-volume retention](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/#persistentvolumeclaim-retention)
