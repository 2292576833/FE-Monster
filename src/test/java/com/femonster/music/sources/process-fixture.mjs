// Trusted self-authored process fixture. NEVER used for imported source execution.
import { writeFileSync } from 'node:fs';
let text = '';
for await (const chunk of process.stdin) text += chunk;
const input = JSON.parse(text);
if (input.pidFile) writeFileSync(input.pidFile, String(process.pid));
if (input.mode === 'hang') setInterval(() => {}, 1000);
else if (input.mode === 'overflow') process.stdout.write('x'.repeat(2 * 1024 * 1024 + 1));
else if (input.mode === 'failure') process.stdout.write(JSON.stringify({ok: false, code: 'evil', error: input.script}));
else if (input.mode === 'init-network') process.stdout.write(JSON.stringify({ok: false, code: 'INIT_NETWORK_REQUIRED', requiredHosts: input.requiredHosts, error: 'PRIVATE_DIAGNOSTIC', script: 'PRIVATE_SCRIPT', url: 'https://private.example.org/PRIVATE_PATH?key=PRIVATE_QUERY'}));
else if (input.mode === 'coded-failure') process.stdout.write(JSON.stringify({ok: false, code: input.code, requiredHosts: input.requiredHosts, httpStatus: input.httpStatus, error: 'PRIVATE_DIAGNOSTIC', script: 'PRIVATE_SCRIPT', url: 'https://private.example.org/PRIVATE_PATH?key=PRIVATE_QUERY'}));
else if (process.env.NODE_OPTIONS || process.env.FE_FAKE_SECRET || process.env.NODE_PATH || process.env.HTTPS_PROXY) process.exit(7);
else process.stdout.write(JSON.stringify({ok: true, url: 'https://audio.example.org/fixture'}));
