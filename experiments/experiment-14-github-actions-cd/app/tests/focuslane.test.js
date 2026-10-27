import {describe,test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createPlan,validatePlan} from '../src/planner.js';
import {createServer,buildMetadata} from '../src/server.js';

const sample=()=>({planName:'A focused week',startDate:'2026-11-02',dailyMinutes:90,horizonDays:3,subjects:[
  {id:'math',name:'Mathematics',minutes:90,priority:'medium'},
  {id:'cs',name:'Computer science',minutes:120,priority:'high'},
  {id:'writing',name:'Writing',minutes:45,priority:'low'}
]});
const reject=payload=>assert.throws(()=>createPlan(payload),error=>error.status===400);

describe('FocusLane application',()=>{
  let server,base;
  before(async()=>{
    server=createServer({env:{GIT_SHA:'a'.repeat(40),BUILD_NUMBER:'14',APP_MODE:'test',SECRET_TOKEN:'must-not-be-exposed'}});
    server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
  });
  after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const post=(payload,options={})=>fetch(base+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),...options});

  test('priority scheduling fills daily capacity and returns honest totals',()=>{
    const result=createPlan(sample());
    assert.equal(result.totalTargetMinutes,255);assert.equal(result.plannedMinutes,255);assert.equal(result.remainingMinutes,0);
    assert.equal(result.totalCapacityMinutes,270);assert.equal(result.utilizationPercent,94);assert.deepEqual(result.warnings,[]);
    assert.deepEqual(result.days.map(day=>day.plannedMinutes),[90,90,75]);
    assert.deepEqual(result.days[0].sessions,[{subjectId:'cs',name:'Computer science',priority:'high',minutes:90}]);
    assert.deepEqual(result.days[1].sessions.map(s=>[s.subjectId,s.minutes]),[['cs',30],['math',60]]);
    assert.deepEqual(result.days[2].sessions.map(s=>[s.subjectId,s.minutes]),[['math',30],['writing',45]]);
  });
  test('same-priority subjects preserve the user input order',()=>{
    const input=sample();input.subjects.forEach(s=>s.priority='high');
    assert.deepEqual(createPlan(input).days[0].sessions.map(s=>s.subjectId),['math']);
    assert.deepEqual(createPlan(input).subjects.map(s=>s.id),['math','cs','writing']);
  });
  test('insufficient capacity produces remaining targets and an explicit warning',()=>{
    const input=sample();input.dailyMinutes=60;input.horizonDays=2;
    const result=createPlan(input);
    assert.equal(result.plannedMinutes,120);assert.equal(result.remainingMinutes,135);assert.equal(result.utilizationPercent,100);
    assert.equal(result.subjects.find(s=>s.id==='cs').remainingMinutes,0);
    assert.equal(result.subjects.find(s=>s.id==='math').remainingMinutes,90);
    assert.match(result.warnings[0],/135 requested minutes/);
  });
  test('unused days remain empty instead of inventing study sessions',()=>{
    const input=sample();input.subjects=[{id:'read',name:'Reading',minutes:15,priority:'low'}];
    const result=createPlan(input);
    assert.deepEqual(result.days.map(d=>d.plannedMinutes),[15,0,0]);assert.equal(result.utilizationPercent,6);
    assert.deepEqual(result.days[1].sessions,[]);
  });
  test('server free time represents partial and empty days and conserves daily capacity',()=>{
    const partial=createPlan(sample());
    assert.deepEqual(partial.days.map(day=>day.freeMinutes),[0,0,15]);
    const input=sample();input.subjects=[{id:'read',name:'Reading',minutes:15,priority:'low'}];
    const sparse=createPlan(input);
    assert.deepEqual(sparse.days.map(day=>day.freeMinutes),[75,90,90]);
    for(const plan of [partial,sparse]){
      for(const day of plan.days){
        assert.equal(day.plannedMinutes+day.freeMinutes,day.capacityMinutes);
        assert.equal(day.sessions.reduce((total,session)=>total+session.minutes,0)+day.freeMinutes,day.capacityMinutes);
      }
      assert.equal(plan.days.reduce((total,day)=>total+day.freeMinutes,0)+plan.plannedMinutes,plan.totalCapacityMinutes);
    }
  });
  test('the algorithm preserves inputs and agrees across repeated calculations',()=>{
    const input=sample(),original=structuredClone(input);
    const first=createPlan(input);assert.deepEqual(input,original);assert.deepEqual(first,createPlan(input));
    assert.equal(first.subjects.reduce((sum,s)=>sum+s.plannedMinutes,0),first.plannedMinutes);
    for(const day of first.days)assert.ok(day.plannedMinutes<=day.capacityMinutes);
  });
  test('calendar dates advance correctly across leap-day and month boundaries',()=>{
    const input=sample();input.startDate='2028-02-28';
    assert.deepEqual(createPlan(input).days.map(d=>d.date),['2028-02-28','2028-02-29','2028-03-01']);
  });
  test('minimum and maximum supported plans remain capacity-bounded',()=>{
    const low={planName:'Low',startDate:'1900-01-01',dailyMinutes:30,horizonDays:1,subjects:[{id:'x',name:'One',minutes:15,priority:'low'}]};
    assert.equal(createPlan(low).plannedMinutes,15);
    const high={planName:'High',startDate:'2100-12-31',dailyMinutes:480,horizonDays:14,subjects:Array.from({length:6},(_,i)=>({id:'x'+i,name:'Subject '+i,minutes:3000,priority:'high'}))};
    const result=createPlan(high);assert.equal(result.totalTargetMinutes,18000);assert.equal(result.plannedMinutes,6720);assert.equal(result.remainingMinutes,11280);
  });
  test('invalid dates and unsupported date representations are rejected',()=>{
    for(const value of ['2026-02-29','2026-04-31','1900-02-29','2028-2-02','02/02/2028','1899-12-31','2101-01-01',null,5])reject({...sample(),startDate:value});
  });
  test('numeric fields reject strings, booleans, fractions and out-of-range values',()=>{
    for(const value of ['90',true,null,29,481,90.5,NaN,Infinity])reject({...sample(),dailyMinutes:value});
    for(const value of ['3',false,0,15,2.5])reject({...sample(),horizonDays:value});
    for(const value of ['15',true,0,14,3001,30.5]){const input=sample();input.subjects[0].minutes=value;reject(input);}
  });
  test('subject IDs must be valid and unique and priority must be recognized',()=>{
    const duplicate=sample();duplicate.subjects[1].id='math';reject(duplicate);
    for(const id of ['', 'has spaces','!unsafe','x'.repeat(33)]){const input=sample();input.subjects[0].id=id;reject(input);}
    for(const priority of ['urgent','HIGH','__proto__',null,1]){const input=sample();input.subjects[0].priority=priority;reject(input);}
  });
  test('required keys and exact object/array shapes are enforced',()=>{
    reject(null);reject([]);reject({...sample(),extra:'hidden'});
    for(const key of Object.keys(sample())){const input=sample();delete input[key];reject(input);}
    for(const subjects of [null,{},[],Array.from({length:7},(_,i)=>({id:'x'+i,name:'Subject',minutes:15,priority:'low'}))])reject({...sample(),subjects});
    for(const bad of [null,[],{...sample().subjects[0],extra:1}]){const input=sample();input.subjects[0]=bad;reject(input);}
  });
  test('text is trimmed, Unicode is supported, and control characters are rejected',()=>{
    const input=sample();input.planName='  தமிழ் Study  ';input.subjects[0].name='  数学  ';
    const result=validatePlan(input);assert.equal(result.planName,'தமிழ் Study');assert.equal(result.subjects[0].name,'数学');
    for(const value of ['', 'x','bad\u0000name','x'.repeat(81),5])reject({...sample(),planName:value});
    const bad=sample();bad.subjects[0].name='a\nb';reject(bad);
  });
  test('metadata is limited to public build identity',()=>{
    assert.deepEqual(buildMetadata({GIT_SHA:'abc',BUILD_NUMBER:'2',APP_MODE:'cloud',SECRET:'private'}),{version:'1.1.0',gitSha:'abc',buildNumber:'2',mode:'cloud'});
    assert.equal(buildMetadata({}).gitSha,'development');
  });
  test('health and version expose the expected running build identity',async()=>{
    const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.equal((await health.json()).status,'healthy');
    const response=await fetch(base+'/api/version');const value=await response.json();
    assert.equal(value.data.application,'FocusLane');assert.equal(value.data.gitSha,'a'.repeat(40));assert.equal(value.data.buildNumber,'14');
    assert.ok(!JSON.stringify(value).includes('must-not-be-exposed'));
  });
  test('HTTP planning completes the browser-to-API data flow',async()=>{
    const response=await post(sample());assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.data.plannedMinutes,255);assert.equal(result.data.days.length,3);assert.equal(result.data.days[2].freeMinutes,15);assert.equal(result.meta.mode,'test');
  });
  test('tracing, cache and browser protection headers accompany API responses',async()=>{
    const response=await post(sample());assert.match(response.headers.get('X-Request-ID'),/^[a-f0-9-]{36}$/);
    assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'),'DENY');assert.match(response.headers.get('Content-Security-Policy'),/default-src 'self'/);
    assert.match(response.headers.get('Server-Timing'),/app;dur=/);
  });
  test('malformed JSON, wrong media and invalid input return useful error envelopes',async()=>{
    const malformed=await post(null,{body:'{bad'});assert.equal(malformed.status,400);assert.equal((await malformed.json()).error.code,'INVALID_JSON');
    const media=await post(sample(),{headers:{'Content-Type':'text/plain'}});assert.equal(media.status,415);
    const invalid=await post({...sample(),dailyMinutes:-1});assert.equal(invalid.status,400);const error=await invalid.json();assert.match(error.error.message,/dailyMinutes/);assert.ok(error.requestId);
    const parameters=await post(sample(),{headers:{'Content-Type':'application/json; charset=utf-8'}});assert.equal(parameters.status,200);
  });
  test('declared oversized requests are rejected without accepting a partial payload',async()=>{
    const response=await post(null,{body:JSON.stringify({padding:'x'.repeat(17000)})});assert.equal(response.status,413);assert.equal((await response.json()).error.code,'BODY_TOO_LARGE');
  });
  test('chunked oversized JSON is bounded as well',async()=>{
    const response=await new Promise((resolve,rejectRequest)=>{
      const req=http.request(base+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{
        let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));
      });
      req.on('error',rejectRequest);req.write('{"padding":"');for(let i=0;i<18;i++)req.write('x'.repeat(1024));req.end('"}');
    });
    assert.equal(response.status,413);assert.equal(response.body.error.code,'BODY_TOO_LARGE');
  });
  test('unknown routes, methods and unsupported queries are rejected',async()=>{
    assert.equal((await fetch(base+'/missing')).status,404);assert.equal((await fetch(base+'/healthz?x=1')).status,400);
    const method=await fetch(base+'/api/plan');assert.equal(method.status,405);assert.equal(method.headers.get('Allow'),'POST');
    assert.equal((await fetch(base+'/%2e%2e/package.json')).status,404);
  });
  test('local interface assets are served with correct media types and HEAD semantics',async()=>{
    for(const [route,type] of [['/','text/html'],['/styles.css','text/css'],['/app.js','text/javascript'],['/favicon.svg','image/svg+xml']]){
      const response=await fetch(base+route);assert.equal(response.status,200,route);assert.ok(response.headers.get('Content-Type').startsWith(type));
    }
    const page=await fetch(base+'/',{method:'HEAD'});assert.equal(page.status,200);assert.ok(Number(page.headers.get('Content-Length'))>0);assert.equal(await page.text(),'');
    const health=await fetch(base+'/healthz',{method:'HEAD'});assert.equal(health.status,200);assert.equal(await health.text(),'');
  });
  test('independent instances produce identical plans without server-side stored state',async()=>{
    const other=createServer({env:{BUILD_NUMBER:'other'}});other.listen(0,'127.0.0.1');await once(other,'listening');
    try{
      const first=await (await post(sample())).json();
      const second=await (await fetch(`http://127.0.0.1:${other.address().port}/api/plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sample())})).json();
      assert.deepEqual(first.data,second.data);assert.notEqual(first.meta.buildNumber,second.meta.buildNumber);
    }finally{other.closeAllConnections();await new Promise(resolve=>other.close(resolve));}
  });
});
