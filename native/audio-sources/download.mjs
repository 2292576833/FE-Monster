import { createNetwork, parsePublicUrl, fail } from './network.mjs';

const MAX_SCRIPT_BYTES = 512 * 1024;

/** Trusted download only: never evaluates the downloaded text or forwards account state. */
export async function downloadScript(raw, options = {}) {
  const url = parsePublicUrl(raw);
  if (!/\.js$/i.test(url.pathname)) fail('URL_BLOCKED');
  const network = createNetwork([url.hostname], {
    lookup: options.lookup,
    request: options.request,
    responseType: 'bytes',
    limits: { requestMs: 6000, totalMs: 8000, ...options.limits,
      responseBytes: MAX_SCRIPT_BYTES, totalResponseBytes: MAX_SCRIPT_BYTES, maxRequests: 1 }
  });
  try {
    const result = await network.request(url.href);
    if (result.statusCode !== 200) fail('DOWNLOAD_FAILED');
    let script;
    try { script = new TextDecoder('utf-8', { fatal: true }).decode(result.body); }
    catch { fail('INVALID_UTF8'); }
    if (!script.trim()) fail('INVALID_INPUT');
    return { ok: true, script };
  } finally { network.close(); }
}
