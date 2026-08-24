import { createServer } from 'node:http';

const port = Number.parseInt(process.argv[2] || '', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port is required');

let pageAttempts = 0;
let domReady = false;
let pageBody = '';
const requests = [];
const page = `<!doctype html><html><head><meta charset="utf-8"><title>FE Monster recovery fixture</title>
<style>html,body{margin:0;width:100%;height:100%;background:#10263a;color:white}#bootScreen{margin:10%;padding:10%;background:#e85d75;font:700 36px Segoe UI}</style>
</head><body><main id="bootScreen">FE Monster automatic process recovery ready</main><script>
addEventListener('DOMContentLoaded',()=>fetch('/probe/dom-ready',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({marker:document.getElementById('bootScreen')?.textContent||'',href:location.href})}));
</script></body></html>`;

function send(response, status, type, body) {
  const bytes = Buffer.from(body, 'utf8');
  response.writeHead(status, { 'content-type': type, 'content-length': bytes.length, 'cache-control': 'no-store' });
  response.end(bytes);
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  if (requestUrl.pathname !== '/probe/status') requests.push({ method: request.method, path: requestUrl.pathname, at: Date.now() });
  if (requestUrl.pathname === '/probe/dom-ready' && request.method === 'POST') {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      domReady = true;
      pageBody = Buffer.concat(chunks).toString('utf8');
      response.writeHead(204).end();
    });
    return;
  }
  if (requestUrl.pathname === '/probe/status') {
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ domReady, pageAttempts, page: pageBody ? JSON.parse(pageBody) : null, requests }));
    return;
  }
  if (requestUrl.pathname === '/') {
    pageAttempts += 1;
    setTimeout(() => {
      if (!response.destroyed && !response.writableEnded) {
        send(response, 200, 'text/html; charset=utf-8', page);
      }
    }, 5000);
    return;
  }
  if (requestUrl.pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  send(response, 404, 'text/plain; charset=utf-8', 'missing');
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`ready:${port}\n`));
