import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4845);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be a whole number from 1024 to 65535.');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end('Method not allowed');}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Invalid path');}
  if(pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(req.method==='HEAD'?'':JSON.stringify({application:'KitCrew',status:'ok',mode:'local-testing'}));}
  const modulePath=pathname.startsWith('/modules/');
  const base=path.join(appRoot,modulePath?'modules':'public');
  const relative=modulePath?pathname.slice('/modules/'.length):(pathname==='/'?'index.html':pathname.slice(1));
  const target=path.resolve(base,relative);
  if(!target.startsWith(base+path.sep)||relative.includes('\\')||relative.includes('\0')){res.writeHead(403);return res.end('Forbidden');}
  try{const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'});res.end(req.method==='HEAD'?'':bytes);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`KitCrew local workspace: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
