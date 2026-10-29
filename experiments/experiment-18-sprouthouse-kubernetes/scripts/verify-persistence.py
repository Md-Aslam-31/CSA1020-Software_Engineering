#!/usr/bin/env python3
"""Prove PostgreSQL/PVC persistence by restarting only SproutHouse's database.

Run in the Codespace when nobody is editing the library:
  python3 scripts/verify-persistence.py --base http://127.0.0.1:8180

This intentionally causes a brief database restart. It does not delete a pod,
PVC, table or user record. Only row hashes/counts, never row contents/passwords,
are written to evidence/postgres-persistence.json.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.error
import urllib.request

NAMESPACE="sprouthouse-exp18"
CONTEXT="kind-sprouthouse-exp18"
TABLES=("catalog","reservations","activity","request_keys")
SQL="""SELECT json_build_object(
 'database',current_database(),'server_started_at',pg_postmaster_start_time(),
 'tables',json_build_object(
 'catalog',COALESCE((SELECT json_agg(row_to_json(t) ORDER BY t.id) FROM catalog t),'[]'::json),
 'reservations',COALESCE((SELECT json_agg(row_to_json(t) ORDER BY t.id) FROM reservations t),'[]'::json),
 'activity',COALESCE((SELECT json_agg(row_to_json(t) ORDER BY t.id) FROM activity t),'[]'::json),
 'request_keys',COALESCE((SELECT json_agg(row_to_json(t) ORDER BY t.key) FROM request_keys t),'[]'::json)))"""


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base",default="http://127.0.0.1:8180")
    parser.add_argument("--kubeconfig",type=Path,default=Path("/workspaces/.lab-data/private/sprouthouse-exp18/operator-kubeconfig"))
    parser.add_argument("--output",type=Path,default=Path(__file__).resolve().parents[1]/"evidence/postgres-persistence.json")
    args=parser.parse_args()
    if os.environ.get("CODESPACES")!="true" or not os.environ.get("CODESPACE_NAME"):
        parser.error("Run this demonstration in the Codespaces browser lab; local environments are protected.")
    kubectl=shutil.which("kubectl") or "/workspaces/.lab-data/tools/kubectl"
    if not Path(kubectl).is_file() or not args.kubeconfig.is_file():
        parser.error("The browser lab kubectl and private operator kubeconfig are required.")
    prefix=[kubectl,"--kubeconfig",str(args.kubeconfig),"--context",CONTEXT,"--namespace",NAMESPACE]
    report={"started_at":datetime.now(timezone.utc).isoformat(),"context":CONTEXT,"namespace":NAMESPACE,
            "success":False,"user_records_deleted":False,"pvc_deleted":False,"credentials_printed":False}

    def command(arguments,timeout=240):
        result=subprocess.run(prefix+arguments,capture_output=True,text=True,timeout=timeout)
        if result.returncode:
            # kubectl arguments contain no password or token. Do not echo psql
            # stdout: its snapshot contains private member details in memory.
            raise RuntimeError("Kubernetes command failed: "+" ".join(arguments[:3])+"; "+result.stderr[-600:].strip())
        return result.stdout

    def resource(kind,name):return json.loads(command(["get",kind,name,"-o","json"]))

    def snapshot():
        pod=resource("pod","postgres-0")
        claims=[v["persistentVolumeClaim"]["claimName"] for v in pod["spec"]["volumes"] if "persistentVolumeClaim" in v]
        if len(claims)!=1:raise RuntimeError("Expected the database's one persistent volume claim.")
        claim=resource("pvc",claims[0])
        if claim["status"]["phase"]!="Bound":raise RuntimeError("The PostgreSQL PVC is not bound.")
        inner='PGPASSWORD="$POSTGRES_PASSWORD" PGOPTIONS="-c timezone=UTC" exec psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -qAt -v ON_ERROR_STOP=1 -c "$1"'
        raw=command(["exec","postgres-0","--","sh","-c",inner,"sh",SQL])
        decoded=json.loads(raw)
        hashes={}
        for table in TABLES:
            rows=decoded["tables"][table]
            payload=json.dumps(rows,sort_keys=True,ensure_ascii=False,separators=(",",":")).encode()
            hashes[table]={"row_count":len(rows),"sha256":hashlib.sha256(payload).hexdigest()}
        return {"captured_at":datetime.now(timezone.utc).isoformat(),"database":decoded["database"],
                "database_started_at":decoded["server_started_at"],"pod_uid":pod["metadata"]["uid"],
                "pvc_name":claims[0],"pvc_uid":claim["metadata"]["uid"],"pvc_phase":claim["status"]["phase"],"tables":hashes}

    def wait_ready():
        # Liveness alone would not establish database recovery. This calls the
        # backend's real PostgreSQL readiness endpoint from inside a live pod.
        pods=json.loads(command(["get","pods","-l","app=sprouthouse,tier=backend","-o","json"]))["items"]
        pod=next(p["metadata"]["name"] for p in pods if p["status"]["phase"]=="Running")
        probe="import urllib.request,json;r=urllib.request.urlopen('http://127.0.0.1:8000/readyz',timeout=4);assert json.load(r)['status']=='ready'"
        deadline=time.monotonic()+150
        successes=0
        while time.monotonic()<deadline:
            try:
                command(["exec",pod,"--","python","-c",probe],timeout=15)
                with urllib.request.urlopen(args.base.rstrip("/")+"/api/runtime",timeout=8) as response:
                    runtime=json.load(response)
                if runtime.get("database")!="PostgreSQL" or runtime.get("database_status")!="connected":raise RuntimeError("Database not connected")
                successes+=1
                if successes==3:return runtime
            except (RuntimeError,urllib.error.URLError,TimeoutError,ValueError,subprocess.TimeoutExpired):successes=0
            time.sleep(2)
        raise RuntimeError("PostgreSQL-backed readiness did not recover within 150 seconds.")

    try:
        stateful=resource("statefulset","postgres")
        if stateful["spec"]["replicas"]!=1 or stateful["metadata"]["namespace"]!=NAMESPACE:
            raise RuntimeError("Unexpected database StatefulSet; restart refused.")
        report["before"]=snapshot()
        print("Captured table hashes and the bound PVC identity; row contents remain private.",flush=True)
        report["restart_output"]=command(["rollout","restart","statefulset/postgres"]).strip()
        report["rollout_output"]=command(["rollout","status","statefulset/postgres","--timeout=240s"],timeout=270).strip()
        command(["wait","--for=condition=Ready","pod/postgres-0","--timeout=150s"],timeout=180)
        runtime=wait_ready()
        report["after"]=snapshot()
        before,after=report["before"],report["after"]
        report["same_pvc_uid"]=before["pvc_uid"]==after["pvc_uid"]
        report["pod_recreated"]=before["pod_uid"]!=after["pod_uid"]
        report["postgres_process_restarted"]=before["database_started_at"]!=after["database_started_at"]
        report["all_table_hashes_and_counts_identical"]=before["tables"]==after["tables"]
        report["frontend_api_postgresql_ready"]=runtime["database_status"]=="connected"
        report["runtime_after"]={key:runtime.get(key) for key in ["application","version","backend_pod","namespace","database","database_status","database_version","counts"]}
        report["success"]=all(report[key] for key in ["same_pvc_uid","pod_recreated","postgres_process_restarted","all_table_hashes_and_counts_identical","frontend_api_postgresql_ready"])
        if not report["success"]:raise AssertionError("Persistence comparison failed. Retain the evidence and inspect it; no records were reset.")
        print("PASS: PostgreSQL pod and process restarted; the same PVC retained identical data in all four tables.",flush=True)
    except Exception as error:
        report["error"]=str(error)
    finally:
        report["finished_at"]=datetime.now(timezone.utc).isoformat()
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
        print("Persistence evidence: "+str(args.output),flush=True)
    return 0 if report["success"] else 1


if __name__=="__main__":raise SystemExit(main())
