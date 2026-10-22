import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const assets = new Map([
  ['/', ['learning-progress/index.html', 'text/html; charset=utf-8']],
  ['/learning-progress/', ['learning-progress/index.html', 'text/html; charset=utf-8']],
  ['/learning-progress/index.html', ['learning-progress/index.html', 'text/html; charset=utf-8']],
  ['/learning-progress/styles.css', ['learning-progress/styles.css', 'text/css; charset=utf-8']],
  ['/learning-progress/app.js', ['learning-progress/app.js', 'text/javascript; charset=utf-8']],
  ['/src/progress.js', ['src/progress.js', 'text/javascript; charset=utf-8']]
]);

http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(302, { Location: '/learning-progress/' });
    res.end();
    return;
  }
  const asset = assets.get(pathname);
  if (req.method !== 'GET' || !asset) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  try {
    const body = await readFile(fileURLToPath(new URL(asset[0], root)));
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unable to load the demo.');
  }
}).listen(4829, '127.0.0.1', () => {
  console.log('LearnLoop local demo: http://127.0.0.1:4829/learning-progress/');
});
