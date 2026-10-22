const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4823);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.ttf':'font/ttf'};
const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  if (requestUrl.pathname === '/download' && req.method === 'POST') {
    let data = '', size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) { res.writeHead(413); res.end('Export is too large'); req.destroy(); return; }
      data += chunk.toString();
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      const fields = new URLSearchParams(data);
      const filename = (fields.get('filename') || 'forme-export.txt').replace(/[^a-zA-Z0-9._-]/g, '_');
      const contentType = filename.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';
      res.writeHead(200, {'Content-Type':contentType, 'Content-Disposition':`attachment; filename="${filename}"`, 'Cache-Control':'no-store'});
      res.end(fields.get('content') || '');
    });
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400); res.end('Invalid path'); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(data);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`FORME local prototype: http://127.0.0.1:${port}`));
