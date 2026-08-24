import { createServer } from 'node:http';

const port = Number.parseInt(process.argv[2] || '', 10);
const failureCount = Number.parseInt(process.argv[3] || '2', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port is required');
if (!Number.isInteger(failureCount) || failureCount < 0 || failureCount > 20) throw new Error('failure count is invalid');

let pageAttempts = 0;
let domReady = false;
const events = [];
const readyPage = `<!doctype html><html><head><meta charset="utf-8"><title>FE Monster</title></head>
<body><main id="bootScreen">FE Monster transient startup recovered</main><script>
addEventListener('DOMContentLoaded',()=>fetch('/probe/dom-ready',{method:'POST'}));
</script></body></html>`;

function send(response, status, type, body) {
  const bytes = Buffer.from(body, 'utf8');
  response.writeHead(status, {
    'content-type': type,
    'content-length': bytes.length,
    'cache-control': 'no-store'
  });
  response.end(bytes);
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  if (requestUrl.pathname !== '/probe/status') {
    events.push({ method: request.method, path: requestUrl.pathname, at: Date.now() });
  }
  if (requestUrl.pathname === '/probe/status') {
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ pageAttempts, failureCount, healthy: pageAttempts >= failureCount, domReady, events }));
    return;
  }
  if (requestUrl.pathname === '/probe/dom-ready' && request.method === 'POST') {
    domReady = true;
    response.writeHead(204).end();
    return;
  }
  if (requestUrl.pathname === '/') {
    pageAttempts += 1;
    if (pageAttempts <= failureCount) {
      send(response, 503, 'text/html; charset=utf-8', '<!doctype html><title>temporary startup failure</title><body>retry later</body>');
      return;
    }
    send(response, 200, 'text/html; charset=utf-8', readyPage);
    return;
  }
  if (requestUrl.pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  send(response, 404, 'text/plain; charset=utf-8', 'missing');
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`ready:${port}\n`));
