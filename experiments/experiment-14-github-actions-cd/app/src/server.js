import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createPlan,InputError} from './planner.js';

const MAX_BODY=16*1024;
const PUBLIC=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const ASSETS=new Map([
  ['/',['index.html','text/html; charset=utf-8']],
  ['/index.html',['index.html','text/html; charset=utf-8']],
  ['/styles.css',['styles.css','text/css; charset=utf-8']],
  ['/app.js',['app.js','text/javascript; charset=utf-8']],
  ['/favicon.svg',['favicon.svg','image/svg+xml']]
]);

export function buildMetadata(env=process.env) {
  return Object.freeze({version:'1.1.0',gitSha:env.GIT_SHA||'development',buildNumber:env.BUILD_NUMBER||'local',mode:env.APP_MODE||'local'});
}

function readJson(req) {
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;let oversized=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){oversized=true;chunks.length=0;}else if(!oversized)chunks.push(chunk);});
    req.on('end',()=>{
      if(oversized){reject(new InputError('Request body exceeds 16 KiB.',413,'BODY_TOO_LARGE'));return;}
      try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new InputError('Request body must contain valid JSON.',400,'INVALID_JSON'));}
    });
    req.on('error',reject);
  });
}

export function createServer({env=process.env}={}) {
  const meta=buildMetadata(env);
  const server=http.createServer(async(req,res)=>{
    const requestId=randomUUID();
    const started=performance.now();
    res.setHeader('X-Request-ID',requestId);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const reply=(status,payload)=>{
      const body=JSON.stringify(payload);
      res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Length',Buffer.byteLength(body));res.setHeader('Server-Timing',`app;dur=${(performance.now()-started).toFixed(1)}`);
      res.end(req.method==='HEAD'?undefined:body);
    };
    try {
      const url=new URL(req.url,'http://focuslane.local');
      if(url.search) throw new InputError('Query parameters are not supported on this endpoint.');
      const route=url.pathname;
      const methods=route==='/api/plan'?['POST']:route==='/healthz'||route==='/api/version'||ASSETS.has(route)?['GET','HEAD']:null;
      if(!methods) throw new InputError('This route does not exist.',404,'NOT_FOUND');
      if(!methods.includes(req.method)){res.setHeader('Allow',methods.join(', '));throw new InputError(`Use ${methods.join(' or ')} for this endpoint.`,405,'METHOD_NOT_ALLOWED');}
      if(route==='/healthz'){reply(200,{status:'healthy',application:'FocusLane',version:meta.version});return;}
      if(route==='/api/version'){reply(200,{data:{application:'FocusLane',...meta},meta});return;}
      if(route==='/api/plan'){
        if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json') throw new InputError('Send the request with Content-Type: application/json.',415,'UNSUPPORTED_MEDIA_TYPE');
        if(Number(req.headers['content-length'])>MAX_BODY){req.resume();throw new InputError('Request body exceeds 16 KiB.',413,'BODY_TOO_LARGE');}
        reply(200,{data:createPlan(await readJson(req)),meta});return;
      }
      const [name,type]=ASSETS.get(route);const body=await readFile(path.join(PUBLIC,name));
      res.statusCode=200;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-cache');res.setHeader('Content-Length',body.length);res.end(req.method==='HEAD'?undefined:body);
    } catch(error) {
      if(res.writableEnded||res.destroyed)return;
      const known=error instanceof InputError;
      if(!known)console.error(JSON.stringify({level:'error',requestId,message:error.message}));
      reply(known?error.status:500,{error:{code:known?error.code:'INTERNAL_ERROR',message:known?error.message:'The request could not be completed.'},meta,requestId});
    }
  });
  server.requestTimeout=20_000;server.headersTimeout=15_000;server.keepAliveTimeout=5_000;
  return server;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||8000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
  const server=createServer();
  server.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({event:'listening',application:'FocusLane',port,...buildMetadata()})));
  const close=()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10_000).unref();};
  process.once('SIGTERM',close);process.once('SIGINT',close);
}
