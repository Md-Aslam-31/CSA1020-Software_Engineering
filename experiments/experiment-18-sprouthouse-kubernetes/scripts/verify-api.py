#!/usr/bin/env python3
"""Verify the deployed HTTP → backend → PostgreSQL workflow.

Run inside the Codespace after deployment. The verifier creates one clearly
named community seed variety and four reservations, preserving that small
audit trail. It never resets or deletes the library or modifies seeded stock.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base",default="http://127.0.0.1:8180",help="Running frontend URL; default: %(default)s")
    parser.add_argument("--output",type=Path,default=Path(__file__).resolve().parents[1]/"evidence/live-api-tests.json")
    args=parser.parse_args()
    base=args.base.rstrip("/")
    if urllib.parse.urlparse(base).scheme not in ("http","https"):
        parser.error("--base must be an http:// or https:// URL")
    run_id=uuid.uuid4().hex
    report={"started_at":datetime.now(timezone.utc).isoformat(),"base":base,"checks":[],"backend_pods_observed":[],
            "fixture_policy":"One new Windowbox Basil variety and its reservation audit trail are retained. Existing seed varieties are never changed.","passed":0,"total":0,"success":False}
    observed=set();lock=threading.Lock()

    def call(path,method="GET",data=None,headers=None,raw=None):
        outgoing={"Accept":"application/json","X-Request-ID":"proof-"+run_id}
        if data is not None:
            raw=json.dumps(data,ensure_ascii=False).encode();outgoing["Content-Type"]="application/json"
        outgoing.update(headers or {})
        request=urllib.request.Request(base+path,data=raw,headers=outgoing,method=method)
        try:
            response=urllib.request.urlopen(request,timeout=20)
        except urllib.error.HTTPError as error:
            response=error
        with response:
            payload=response.read()
            status=response.status
            received={key.lower():value for key,value in response.headers.items()}
        if received.get("x-backend-pod"):
            with lock:observed.add(received["x-backend-pod"])
        try:value=json.loads(payload)
        except (ValueError,UnicodeError):raise AssertionError(f"{method} {path} returned a non-JSON response (HTTP {status}).") from None
        return status,value,received

    def check(name,condition,detail=None):
        record={"name":name,"passed":bool(condition)}
        if detail is not None:record["detail"]=detail
        report["checks"].append(record)
        print(("PASS " if condition else "FAIL ")+name,flush=True)
        if not condition:raise AssertionError(name)

    def catalog_item(seed_id):
        status,data,_=call("/api/catalog")
        if status!=200:raise AssertionError("Could not read live stock.")
        return next(row for row in data["items"] if row["id"]==seed_id)

    try:
        status,data,_=call("/api/catalog")
        check("Catalog is served by the deployed API",status==200 and isinstance(data.get("items"),list) and len(data["items"])>=12)
        original=data["items"]
        original_ids={row["id"] for row in original}
        check("Three seed categories are available",set(data.get("categories",[]))=={"Herbs","Vegetables","Flowers"})
        sample=original[0]
        status,data,_=call("/api/catalog?search="+urllib.parse.quote(sample["name"]))
        check("Search matches a real seed variety",status==200 and any(row["id"]==sample["id"] for row in data["items"]))
        status,data,_=call("/api/catalog?category=Herbs")
        check("Category filter returns only herbs",status==200 and data["items"] and all(row["category"]=="Herbs" for row in data["items"]))
        status,data,_=call("/api/catalog?search="+run_id)
        check("An unmatched search returns an empty result",status==200 and data["items"]==[])
        status,overview_before,_=call("/api/overview")
        check("Overview reports actual catalogue counts",status==200 and overview_before["total_varieties"]==len(original))
        status,runtime,_=call("/api/runtime")
        check("Runtime confirms PostgreSQL and live pod identity",status==200 and runtime.get("database")=="PostgreSQL" and runtime.get("database_status")=="connected" and runtime.get("backend_pod") and runtime.get("namespace")=="sprouthouse-exp18",{"backend_pod":runtime.get("backend_pod"),"namespace":runtime.get("namespace"),"database_version":runtime.get("database_version")})
        check("Runtime database table count agrees with catalog",runtime.get("counts",{}).get("catalog")==len(original))

        fixture={"name":"Windowbox Basil","variety":"Genovese · community batch","category":"Herbs",
                 "description":"Compact, fragrant basil for sunny windowsills. Added by the community seed librarian.",
                 "days_to_harvest":40,"stock":2,"unit":"packet","light":"Full sun","accent":"#c8db9c"}
        status,data,_=call("/api/catalog","POST",fixture)
        check("A custom seed variety can be created",status==201 and data.get("item",{}).get("name")==fixture["name"])
        seed_id=data["item"]["id"];report["fixture_seed_id"]=seed_id
        check("New variety has its own database identity",seed_id not in original_ids and data["item"]["stock"]==2)
        status,data,_=call(f"/api/catalog/{seed_id}/restock","POST",{"quantity":3,"note":"Fresh packets donated at the community exchange."})
        check("Restock updates persisted available stock",status==200 and data["item"]["stock"]==5)
        status,data,_=call(f"/api/catalog/{seed_id}/restock","POST",{"quantity":1001})
        check("Invalid restock quantities are rejected",status==400 and "error" in data)
        check("Rejected restock leaves stock unchanged",catalog_item(seed_id)["stock"]==5)
        status,data,_=call("/api/catalog","POST",{"name":" ","stock":True})
        check("Invalid custom-seed input returns useful validation",status==400 and data.get("error",{}).get("fields"))
        status,data,_=call("/api/reservations","POST",{"seed_id":seed_id,"quantity":True,"member_name":"Community Grower","member_email":"grower@example.invalid"})
        check("Boolean quantities cannot bypass number validation",status==400)
        status,data,_=call("/api/reservations","POST",{"seed_id":seed_id,"quantity":1,"member_name":"Community Grower","member_email":"not-an-email"})
        check("Invalid email input is rejected",status==400 and "member_email" in data.get("error",{}).get("fields",{}))
        status,data,_=call("/api/catalog/2147483647/restock","POST",{"quantity":1})
        check("A missing seed returns JSON 404",status==404 and data.get("error",{}).get("code")=="not_found")
        status,data,_=call("/api/reservations/2147483647","PATCH",{"status":"collected"})
        check("A missing reservation returns JSON 404",status==404)
        status,data,_=call("/api/catalog","POST",raw=b"{",headers={"Content-Type":"application/json"})
        check("Malformed JSON is rejected without a server error",status==400)
        status,data,_=call("/api/catalog","POST",raw=b"name=Mint",headers={"Content-Type":"application/x-www-form-urlencoded"})
        check("Non-JSON mutation requests are rejected",status==415)

        def reservation_payload(quantity,name="Community Grower"):
            return {"seed_id":seed_id,"quantity":quantity,"member_name":name,"member_email":"grower@example.invalid","notes":"Collect at the Saturday seed exchange."}
        status,data,_=call("/api/reservations","POST",reservation_payload(3),{"Idempotency-Key":run_id+"-welcome"})
        check("Reservation creation deducts stock",status==201 and data["reservation"]["status"]=="reserved" and catalog_item(seed_id)["stock"]==2)
        welcome_id=data["reservation"]["id"]

        def competing_reservation(index):
            return call("/api/reservations","POST",reservation_payload(1,"Balcony Grower "+str(index+1)),{"Idempotency-Key":run_id+"-grower-"+str(index)})
        with ThreadPoolExecutor(max_workers=8) as pool:responses=list(pool.map(competing_reservation,range(8)))
        winners=[response[1]["reservation"] for response in responses if response[0]==201]
        check("Eight concurrent requests cannot oversell two packets",len(winners)==2 and sum(response[0]==409 for response in responses)==6,{"requests":8,"successful_reservations":len(winners),"stock_conflicts":sum(response[0]==409 for response in responses)})
        check("Concurrent stock reaches zero and never becomes negative",catalog_item(seed_id)["stock"]==0)
        status,data,_=call("/api/reservations","POST",reservation_payload(1),{"Idempotency-Key":run_id+"-empty"})
        check("Out-of-stock requests return HTTP 409",status==409 and data.get("error",{}).get("code")=="insufficient_stock")

        collected_id=winners[0]["id"]
        status,data,_=call(f"/api/reservations/{collected_id}","PATCH",{"status":"collected"})
        check("A reserved packet can be collected",status==200 and data["reservation"]["status"]=="collected" and data["reservation"]["collected_at"])
        status,data,_=call(f"/api/reservations/{collected_id}","PATCH",{"status":"collected"})
        check("Repeating collection is safe and does not restore stock",status==200 and catalog_item(seed_id)["stock"]==0)
        status,data,_=call(f"/api/reservations/{collected_id}","PATCH",{"status":"cancelled"})
        check("Collected reservations cannot be cancelled afterward",status==409 and data.get("error",{}).get("code")=="invalid_transition")
        cancelled_id=winners[1]["id"]
        status,data,_=call(f"/api/reservations/{cancelled_id}","PATCH",{"status":"cancelled"})
        check("Cancellation returns its packet to stock",status==200 and data["reservation"]["status"]=="cancelled" and catalog_item(seed_id)["stock"]==1)

        def cancel_welcome(_):return call(f"/api/reservations/{welcome_id}","PATCH",{"status":"cancelled"})
        with ThreadPoolExecutor(max_workers=6) as pool:cancellations=list(pool.map(cancel_welcome,range(6)))
        check("Concurrent cancellation is idempotent",all(response[0]==200 and response[1]["reservation"]["status"]=="cancelled" for response in cancellations))
        check("Concurrent cancellation restores three packets exactly once",catalog_item(seed_id)["stock"]==4)

        duplicate_payload=reservation_payload(2,"Windowbox Grower")
        def duplicate(_):return call("/api/reservations","POST",duplicate_payload,{"Idempotency-Key":run_id+"-shared"})
        with ThreadPoolExecutor(max_workers=6) as pool:duplicates=list(pool.map(duplicate,range(6)))
        duplicate_ids={response[1].get("reservation",{}).get("id") for response in duplicates}
        check("Concurrent duplicate requests create one reservation",sum(response[0]==201 for response in duplicates)==1 and sum(response[0]==200 for response in duplicates)==5 and len(duplicate_ids)==1,{"requests":6,"created":sum(response[0]==201 for response in duplicates),"replayed":sum(response[0]==200 for response in duplicates)})
        check("Duplicate requests debit two packets only once",catalog_item(seed_id)["stock"]==2)
        check("Replay responses carry an idempotency marker",all(response[2].get("idempotent-replayed")=="true" for response in duplicates if response[0]==200))
        status,data,_=call("/api/reservations","POST",reservation_payload(1,"Windowbox Grower"),{"Idempotency-Key":run_id+"-shared"})
        check("Reusing a key with different content is rejected",status==409 and data.get("error",{}).get("code")=="idempotency_conflict")
        check("Rejected key reuse changes no stock",catalog_item(seed_id)["stock"]==2)

        status,data,_=call("/api/reservations")
        own=[row for row in data.get("items",[]) if row["seed_id"]==seed_id]
        check("Reservation history preserves the four real workflow records",status==200 and len(own)==4 and {row["status"] for row in own}=={"reserved","collected","cancelled"})
        report["fixture_reservation_codes"]=[row["code"] for row in own]
        report["active_fixture_reservation_id"]=next(iter(duplicate_ids))
        status,data,_=call("/api/activity")
        kinds={row["kind"] for row in data.get("items",[]) if fixture["name"] in row["message"]}
        check("The real activity log records every workflow action",status==200 and {"new_variety","restocked","reserved","collected","cancelled"}<=kinds)
        status,overview_after,_=call("/api/overview")
        check("Overview includes the new variety and final stock",status==200 and overview_after["total_varieties"]==overview_before["total_varieties"]+1 and overview_after["available_packets"]==overview_before["available_packets"]+2)
        check("Overview counts the retained active reservation and collection",overview_after["active_reservations"]==overview_before["active_reservations"]+1 and overview_after["collected_packets"]==overview_before["collected_packets"]+1)
        current={row["id"]:row for row in call("/api/catalog")[1]["items"]}
        check("All original seed stocks remain unchanged",all(current[row["id"]]["stock"]==row["stock"] for row in original))
        for _ in range(16):call("/api/runtime")
        check("Requests were served by both backend replicas",len(observed)>=2,{"backend_pods":sorted(observed)})
        report["success"]=True
    except Exception as error:
        report["error"]=str(error)
    finally:
        report["backend_pods_observed"]=sorted(observed)
        report["finished_at"]=datetime.now(timezone.utc).isoformat()
        report["total"]=len(report["checks"])
        report["passed"]=sum(row["passed"] for row in report["checks"])
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
        print(f"{report['passed']}/{report['total']} HTTP workflow checks passed. Evidence: {args.output}",flush=True)
    return 0 if report["success"] else 1


if __name__=="__main__":raise SystemExit(main())
