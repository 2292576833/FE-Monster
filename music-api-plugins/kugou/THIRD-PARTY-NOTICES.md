# Third-party notices

This plugin bundles selected runtime modules and production dependencies of:

- `kugoumusicapi` 1.5.1, source commit `283f1e97b110726b208a64b486a657c0fc0a6126` — MIT
- `axios` — MIT
- `big-integer` — Unlicense
- `crypto-js` — MIT
- `node-forge` — BSD-3-Clause
- `pako` — MIT
- `follow-redirects`, `form-data`, and `proxy-from-env` — MIT

The bundled JavaScript retains license comments emitted by esbuild. The upstream `kugoumusicapi` MIT license is included as `LICENSE`.

The FE Monster adapter was written for its local provider contract; it consumes the linked upstream modules without exposing their embedded QR-login routes. Official-site login and domain-filtered cookie capture are implemented by the FE Monster host.

These APIs are intended for interoperability, study, and personal use. Music content and account data remain subject to the applicable platform terms and rights-holder permissions.
