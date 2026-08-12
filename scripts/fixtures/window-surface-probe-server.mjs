import http from 'node:http';

const port = Number.parseInt(process.argv[2] || '', 10);
const mode = ['normal', 'maximized', 'fullscreen'].includes(process.argv[3])
  ? process.argv[3]
  : 'normal';
let commandSequence = 0;
let commandAction = '';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('A valid TCP port is required.');
}

const html = `<!doctype html>
<html data-fe-platform="desktop" data-fe-client="embedded">
<head>
  <meta charset="utf-8">
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #020202; }
  </style>
</head>
<body>
  <script>
    let observedCommandSequence = 0;
    const pollWindowCommand = async () => {
      try {
        const command = await fetch('/command', { cache: 'no-store' }).then((response) => response.json());
        if (command.sequence > observedCommandSequence && command.action) {
          observedCommandSequence = command.sequence;
          window.chrome?.webview?.postMessage({ type: 'fe-window', action: command.action });
        }
      } catch {}
      setTimeout(pollWindowCommand, 40);
    };
    addEventListener('DOMContentLoaded', pollWindowCommand);
  </script>
</body>
</html>`;

const server = http.createServer((request, response) => {
  if (request.url === '/command' && request.method === 'GET') {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'close'
    });
    response.end(JSON.stringify({ sequence: commandSequence, action: commandAction, mode }));
    return;
  }
  if (request.url?.startsWith('/command/') && request.method === 'POST') {
    const action = decodeURIComponent(request.url.slice('/command/'.length)).trim().toLowerCase();
    if (!['fullscreen', 'normal'].includes(action)) {
      response.writeHead(400, { connection: 'close' });
      response.end('invalid command');
      return;
    }
    commandSequence += 1;
    commandAction = action;
    response.writeHead(204, { 'cache-control': 'no-store', connection: 'close' });
    response.end();
    return;
  }
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'close'
  });
  response.end(html);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`ready:${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
