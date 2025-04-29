/**
 * src/utils/getFetch.js
 *
 * Universal fetch resolver.
 * -------------------------------------------------
 * Saltcorn ≥ v1.0 ships with Node 18.19.0 which already
 * includes the WHATWG `fetch` implementation.  The previous
 * polyfill that dynamically imported `node-fetch` is no longer
 * required.  An asynchronous façade is retained so existing
 * callers that await `getFetch()` continue to work unchanged.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 30 Apr 2025 – native-only implementation
 */

'use strict';

/**
 * Cached reference – ensures subsequent calls resolve instantly.
 *
 * @type {typeof fetch | null}
 */
let cachedFetch = null;

/**
 * Return the global `fetch` implementation wrapped in a promise.
 *
 * @returns {Promise<typeof fetch>}
 */
async function getFetch() {
  if (!cachedFetch) {
    if (typeof globalThis.fetch !== 'function') {
      throw new Error(
        'Global fetch is not available – Node ≥ 18.0.0 is required.',
      );
    }
    cachedFetch = globalThis.fetch.bind(globalThis);
  }
  return cachedFetch;
}

module.exports = getFetch;