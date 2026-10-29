"""Bounded sample load: measure real HTTP responses and serving frontend pods."""
import argparse,collections,concurrent.futures,datetime,json,statistics,time,urllib.request
parser=argparse.ArgumentParser()
parser.add_argument('--base',default='http://127.0.0.1:8180')
parser.add_argument('--requests',type=int,default=120)
parser.add_argument('--workers',type=int,default=8)
parser.add_argument('--expect-pods',type=int,default=3)
parser.add_argument('--output')
args=parser.parse_args()
assert 10<=args.requests<=1000 and 1<=args.workers<=32 and 1<=args.expect_pods<=6
def call(index):
    start=time.perf_counter()
    request=urllib.request.Request(args.base.rstrip('/')+'/frontend-info',headers={'Connection':'close','Cache-Control':'no-cache'})
    with urllib.request.urlopen(request,timeout=10) as response:
        data=json.load(response)
        assert response.status==200 and data.get('frontend_pod')
        return data['frontend_pod'],(time.perf_counter()-start)*1000
started=time.perf_counter()
with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
    results=list(pool.map(call,range(args.requests)))
elapsed=time.perf_counter()-started
pod_hits=collections.Counter(pod for pod,_ in results)
latencies=sorted(latency for _,latency in results)
result={'measuredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'totalRequests':len(results),'workers':args.workers,'http200Responses':len(results),'distinctFrontendPods':len(pod_hits),'frontendPodHits':dict(sorted(pod_hits.items())),'elapsedSeconds':round(elapsed,3),'meanMilliseconds':round(statistics.mean(latencies),3),'p95Milliseconds':round(latencies[min(len(latencies)-1,int(len(latencies)*.95))],3),'expectedFrontendPods':args.expect_pods,'passed':len(results)==args.requests and len(pod_hits)==args.expect_pods,'scope':'A bounded demonstration of service load balancing; not a production capacity benchmark.'}
if args.output:
    from pathlib import Path
    target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
if not result['passed']:raise SystemExit(1)
