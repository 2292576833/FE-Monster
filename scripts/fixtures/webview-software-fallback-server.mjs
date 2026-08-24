import { createServer } from 'node:http';

const port = Number.parseInt(process.argv[2] || '', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port is required');
const failFirstNavigation = process.argv.includes('--fail-first-navigation');

let domReady = false;
let pageBody = '';
const requests = [];
let pageAttempts = 0;
const page = `<!doctype html><html data-fe-client="embedded"><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#10263a;color:#fff}
#bootScreen{position:fixed;inset:18%;display:grid;place-items:center;background:#e85d75;font:700 42px Segoe UI}
</style></head><body><main id="bootScreen">FE Monster software fallback ready</main><script>
addEventListener('DOMContentLoaded',()=>fetch('/probe/dom-ready',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:document.title,marker:document.getElementById('bootScreen')?.textContent||'',width:innerWidth,height:innerHeight})}));
</script></body></html>`;

const server = createServer((request, response) => {
  if (request.url !== '/probe/status') {
    requests.push({ method: request.method, url: request.url, at: Date.now() });
  }
  if (request.url === '/probe/dom-ready' && request.method === 'POST') {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      domReady = true;
      pageBody = Buffer.concat(chunks).toString('utf8');
      response.writeHead(204).end();
    });
    return;
  }
  if (request.url === '/probe/status') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ domReady, page: pageBody ? JSON.parse(pageBody) : null, requests, pageAttempts }));
    return;
  }
  const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  if (requestUrl.pathname === '/') {
    pageAttempts += 1;
    if (failFirstNavigation && pageAttempts === 1) {
      response.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end('<!doctype html><title>temporary startup failure</title>');
      return;
    }
  } else if (requestUrl.pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(page);
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`ready:${port}\n`));
