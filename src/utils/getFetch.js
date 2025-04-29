/**
 * @fileoverview
 * Cross-runtime `fetch` resolver for the Saltcorn Large-Language-Model plug-in.
 *
 * Node ≥ 18 ships a global WHATWG-style `fetch`.  Earlier Node versions and the
 * Saltcorn Docker images (currently based on Node 16) do not.  Directly
 * requiring the ESM-only `node-fetch` package from a CommonJS context triggers
 * the “require() of ES module … not supported” error.
 *
 * This helper transparently returns a standards-compliant `fetch` implementation
 * regardless of the runtime:
 *
 *   1. If `globalThis.fetch` already exists, it is returned immediately.
 *   2. Otherwise `node-fetch` is *dynamically* imported (avoids the CJS ➞ ESM
 *      trap) and its default export is cached for subsequent calls.
 *
 * Usage:
 *
 *   const getFetch = require('../utils/getFetch');
 *
 *   async function doSomething() {
 *     const fetch = await getFetch();
 *     const res   = await fetch('https://example.com');
 *     …
 *   }
 *
 * The function is intentionally asynchronous so callers can `await` the dynamic
 * import without needing top-level await.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Created:  29 April 2025
 */

'use strict';

/* eslint-disable node/no-unsupported-features/es-syntax */

/**
 * Cached reference to the resolved fetch implementation.
 *
 * @type {typeof fetch | undefined}
 * @private
 */
let cachedFetch;

/**
 * Lazily obtain a WHATWG-compliant `fetch` implementation.
 *
 * @returns {Promise<typeof fetch>} A promise resolving to the `fetch` function.
 */
async function getFetch() {
  if (cachedFetch) {
    return cachedFetch;
  }

  /* ---------------------------------------------------------------------- */
  /* 1.  Native fetch (Node ≥ 18, browsers, Cloudflare Workers etc.)        */
  /* ---------------------------------------------------------------------- */
  if (typeof globalThis.fetch === 'function') {
    cachedFetch = globalThis.fetch.bind(globalThis);
    return cachedFetch;
  }

  /* ---------------------------------------------------------------------- */
  /* 2.  Fallback – dynamic import of node-fetch (ESM-only)                 */
  /* ---------------------------------------------------------------------- */
  const { default: fetchImpl } = await import('node-fetch');
  cachedFetch = /** @type {typeof fetch} */ (fetchImpl);
  return cachedFetch;
}

module.exports = getFetch;