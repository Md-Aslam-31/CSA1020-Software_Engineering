import http from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/src/seat-planner.js', ['src/seat-planner.js', 'text/javascript; charset=utf-8']],
  ['/evidence/', ['../evidence/conflict.html', 'text/html; charset=utf-8']],
  ['/evidence/resolution.html', ['../evidence/resolution.html', 'text/html; charset=utf-8']],
  ['/evidence/validation.html', ['../evidence/validation.html', 'text/html; charset=utf-8']]
]);

http.createServer(async (request, response) => {
  const asset = assets.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (request.method !== 'GET' || !asset) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    const body = await readFile(new URL(asset[0], root));
    response.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unable to read this local demo file.');
  }
}).listen(4831, '127.0.0.1', () => {
  console.log('FairSeat local demo: http://127.0.0.1:4831/');
});
