import {test,before,after,describe} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {createServer,buildMetadata} from '../src/server.js';
import {CHECKS,assessRelease,validateAssessment,InputError} from '../src/assessment.js';

function readyPayload(){return {releaseName:'ReleaseHarbor autumn release',version:'1.0.0',owner:'Platform team',releaseDate:'2026-10-30',checks:Object.fromEntries(CHECKS.map(check=>[check.id,true]))};}
describe('ReleaseHarbor application',()=>{
let server,base;
before(async()=>{
  server=createServer({env:{GIT_SHA:'abc123def456',BUILD_NUMBER:'42',APP_MODE:'ci'}});
  server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
async function assess(body,headers={'Content-Type':'application/json'}){return fetch(`${base}/api/assess`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});}

test('fully checked release scores 100 and is ready to rehearse',()=>{
  const result=assessRelease(readyPayload());
  assert.equal(result.score,100);assert.equal(result.completed,12);assert.equal(result.total,12);assert.equal(result.status,'Ready to rehearse');assert.deepEqual(result.blockers,[]);
  assert.ok(result.categories.every(category=>category.score===100));
});
test('unchecked critical gates hold the release even when most items are done',()=>{
  const body=readyPayload();body.checks.secrets=false;body.checks.rollback=false;
  const result=assessRelease(body);assert.equal(result.score,83);assert.equal(result.status,'Hold for blockers');
  assert.deepEqual(result.blockers.map(item=>item.id),['secrets','rollback']);assert.match(result.recommendation,/2 critical checks/);
});
test('missing noncritical work needs attention without inventing blockers',()=>{
  const body=readyPayload();body.checks.support=false;const result=assessRelease(body);
  assert.equal(result.score,92);assert.equal(result.status,'Needs attention');assert.equal(result.blockers.length,0);
  assert.equal(result.categories.find(item=>item.id==='customer').score,50);assert.match(result.recommendation,/remaining 1 check/);
});
test('all-unchecked plan has zero score and exactly four critical blockers',()=>{
  const body=readyPayload();for(const id of Object.keys(body.checks))body.checks[id]=false;
  const result=assessRelease(body);assert.equal(result.score,0);assert.equal(result.blockers.length,4);assert.equal(result.status,'Hold for blockers');
});
test('timeline computes UTC dates across year and leap-day boundaries',()=>{
  const body=readyPayload();body.releaseDate='2028-03-01';assert.deepEqual(assessRelease(body).timeline.map(item=>item.date),['2028-02-28','2028-02-29','2028-03-01','2028-03-02']);
  body.releaseDate='2027-01-01';assert.deepEqual(assessRelease(body).timeline.map(item=>item.date),['2026-12-30','2026-12-31','2027-01-01','2027-01-02']);
});
test('validated plans trim user text and retain Unicode without mutating input',()=>{
  const body=readyPayload();body.owner='  Équipe produit  ';body.releaseName='  Team release  ';const original=structuredClone(body);
  const valid=validateAssessment(body);assert.equal(valid.owner,'Équipe produit');assert.equal(valid.releaseName,'Team release');assert.deepEqual(body,original);assert.notEqual(valid.checks,body.checks);
});
test('unknown fields, missing fields and non-object bodies are rejected',()=>{
  for(const value of [null,[],true,3,'plan'])assert.throws(()=>validateAssessment(value),InputError);
  const missing=readyPayload();delete missing.owner;assert.throws(()=>validateAssessment(missing),/missing required fields: owner/);
  assert.throws(()=>validateAssessment({...readyPayload(),admin:true}),/unsupported fields: admin/);
  const prototype=JSON.parse(JSON.stringify(readyPayload()).replace(/}$/,',"__proto__":{}}'));assert.throws(()=>validateAssessment(prototype),/unsupported fields/);
});
test('checklist requires exact IDs and genuine JSON booleans',()=>{
  for(const invalid of [0,1,'true',null,{},[]]){const body=readyPayload();body.checks.tests=invalid;assert.throws(()=>validateAssessment(body),/checks.tests must be true or false/);}
  const missing=readyPayload();delete missing.checks.tests;assert.throws(()=>validateAssessment(missing),/missing required fields: tests/);
  const unknown=readyPayload();unknown.checks.deploy=true;assert.throws(()=>validateAssessment(unknown),/unsupported fields: deploy/);
});
test('semantic-version validation accepts prerelease/build IDs and rejects malformed versions',()=>{
  for(const version of ['0.0.0','2.8.4-rc.1','1.0.0-alpha-beta+build.001'])assert.equal(validateAssessment({...readyPayload(),version}).version,version);
  for(const version of ['v1.0.0','1.0','01.2.3','1.2.3-01','1.2.3-rc..1','1.2.3+bad..value'])assert.throws(()=>validateAssessment({...readyPayload(),version}),InputError);
});
test('invalid dates and ambiguous date formats do not roll into another day',()=>{
  for(const releaseDate of ['2026-02-29','2026-04-31','2026-13-01','26/10/2026','2026-1-01','not-a-date',null,'1899-12-31','2101-01-01'])assert.throws(()=>validateAssessment({...readyPayload(),releaseDate}),InputError);
});
test('text fields reject blank, long and control-character values',()=>{
  for(const [key,value] of [['releaseName',' '],['owner','x'],['releaseName','x'.repeat(81)],['owner','x'.repeat(61)],['owner','Team\nAdmin'],['releaseName',123]])assert.throws(()=>validateAssessment({...readyPayload(),[key]:value}),InputError);
});
test('health and version endpoints expose the actual supplied build metadata',async()=>{
  const health=await fetch(`${base}/healthz`);assert.equal(health.status,200);assert.equal((await health.json()).status,'healthy');
  const version=await fetch(`${base}/api/version`);const payload=await version.json();assert.equal(payload.data.application,'ReleaseHarbor');assert.equal(payload.data.gitSha,'abc123def456');assert.equal(payload.data.buildNumber,'42');assert.equal(payload.data.mode,'ci');
  assert.deepEqual(buildMetadata({}),{version:'1.0.0',gitSha:'development',buildNumber:'local',mode:'local'});
});
test('browser shell and local assets are served with appropriate media types',async()=>{
  for(const [route,contentType] of [['/','text/html'],['/styles.css','text/css'],['/app.js','text/javascript'],['/favicon.svg','image/svg+xml']]){const result=await fetch(base+route);assert.equal(result.status,200,route);assert.ok(result.headers.get('content-type').startsWith(contentType));assert.ok((await result.text()).length>30);}
});
test('HEAD returns metadata and no body for supported read routes',async()=>{
  for(const route of ['/','/healthz','/api/version']){const result=await fetch(base+route,{method:'HEAD'});assert.equal(result.status,200);assert.equal(await result.text(),'');}
});
test('HTTP assessment completes the browser-to-API calculation path',async()=>{
  const body=readyPayload();body.checks.runbook=false;
  const result=await assess(body);assert.equal(result.status,200);const payload=await result.json();assert.deepEqual(payload.data,assessRelease(body));assert.equal(payload.meta.gitSha,'abc123def456');assert.equal(result.headers.get('cache-control'),'no-store');
});
test('request tracing and browser protection headers are present',async()=>{
  const first=await fetch(`${base}/api/version`);const second=await fetch(`${base}/api/version`);assert.match(first.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);assert.notEqual(first.headers.get('x-request-id'),second.headers.get('x-request-id'));
  assert.equal(first.headers.get('x-content-type-options'),'nosniff');assert.equal(first.headers.get('x-frame-options'),'DENY');assert.match(first.headers.get('content-security-policy'),/script-src 'self'/);assert.match(first.headers.get('server-timing'),/^app;dur=/);
});
test('malformed JSON, wrong media type and failed validation return helpful JSON errors',async()=>{
  const malformed=await assess('{broken');assert.equal(malformed.status,400);assert.equal((await malformed.json()).error.code,'INVALID_JSON');
  const type=await assess('{}',{'Content-Type':'text/plain'});assert.equal(type.status,415);assert.equal((await type.json()).error.code,'UNSUPPORTED_MEDIA_TYPE');
  const invalid=await assess({...readyPayload(),owner:''});assert.equal(invalid.status,400);const error=await invalid.json();assert.equal(error.error.code,'INVALID_INPUT');assert.match(error.error.message,/owner/);assert.ok(error.requestId);
});
test('oversized request is rejected without accepting a partial payload',async()=>{
  const result=await assess(JSON.stringify({...readyPayload(),releaseName:'x'.repeat(17000)}));assert.equal(result.status,413);assert.equal((await result.json()).error.code,'BODY_TOO_LARGE');
  const health=await fetch(`${base}/healthz`);assert.equal(health.status,200);
});
test('chunked oversized JSON is capped without retaining its unbounded body',async()=>{
  const result=await new Promise((resolve,reject)=>{
    const req=http.request(`${base}/api/assess`,{method:'POST',headers:{'Content-Type':'application/json','Transfer-Encoding':'chunked'}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,payload:JSON.parse(Buffer.concat(chunks).toString())}));
    });
    req.on('error',reject);req.write('{"releaseName":"');req.write('x'.repeat(9000));req.write('x'.repeat(9000));req.end('"}');
  });
  assert.equal(result.status,413);assert.equal(result.payload.error.code,'BODY_TOO_LARGE');
});
test('unknown routes, methods, traversal and unsupported queries are rejected',async()=>{
  for(const route of ['/missing','/src/server.js','/%2e%2e/package.json']){const result=await fetch(base+route);assert.equal(result.status,404,route);assert.equal((await result.json()).error.code,'NOT_FOUND');}
  const method=await fetch(`${base}/api/assess`);assert.equal(method.status,405);assert.equal(method.headers.get('allow'),'POST');
  const query=await fetch(`${base}/api/version?token=example`);assert.equal(query.status,400);assert.match((await query.json()).error.message,/Query parameters/);
});
test('independent server instances calculate identical plans without stored server state',async()=>{
  const another=createServer({env:{GIT_SHA:'different-build',BUILD_NUMBER:'43',APP_MODE:'cloud'}});another.listen(0,'127.0.0.1');await once(another,'listening');
  try{const first=await assess(readyPayload());const second=await fetch(`http://127.0.0.1:${another.address().port}/api/assess`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(readyPayload())});const firstBody=await first.json(),secondBody=await second.json();assert.deepEqual(firstBody.data,secondBody.data);assert.equal(secondBody.meta.mode,'cloud');assert.notEqual(firstBody.meta.gitSha,secondBody.meta.gitSha);}finally{another.closeAllConnections();await new Promise(resolve=>another.close(resolve));}
});
});
