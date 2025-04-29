/**
 * src/generation/ollama.js
 *
 * Thin HTTP wrapper around the local Ollama daemon.
 * -------------------------------------------------
 * The dependency on the `ollama` NPM package has been removed; we now
 * communicate with Ollama’s REST interface directly via `fetch`.
 *
 *  • POST /api/generate   – text generation
 *  • POST /api/embeddings – embeddings
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 30 Apr 2025 – node-fetch removed, pure HTTP implementation
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports & constants                                                        */
/* -------------------------------------------------------------------------- */

const getFetch = require('../utils/getFetch');

/** Default base URL for the local daemon */
const DEFAULT_BASE = 'http://127.0.0.1:11434';

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the full URL for an API path, allowing tenant overrides.
 *
 * @param {string|undefined} base   Base URL from cfg / opts or undefined.
 * @param {string}           suffix Route suffix (e.g. '/api/generate').
 * @returns {string}
 */
function url(base, suffix) {
  const cleanBase = (base || DEFAULT_BASE).replace(/\/+$/, '');
  return `${cleanBase}${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* Public API – text generation                                               */
/* -------------------------------------------------------------------------- */

/**
 * Generate text using the Ollama `/api/generate` endpoint.
 *
 * @param {object}  cfg
 * @param {string=} cfg.endpoint      Optional custom generate endpoint.
 * @param {string=} cfg.model         Default model ID.
 * @param {object}  opts
 * @param {string}  opts.prompt       User prompt.
 * @param {string=} opts.model        Per-call model override.
 * @param {number=} opts.temperature  Sampling temperature.
 * @param {boolean=} opts.debugResult Emit console logs.
 * @returns {Promise<string>}
 */
async function getCompletion(cfg, opts) {
  const fetch = await getFetch();

  const endpoint =
    opts.endpoint ?? cfg.endpoint ?? url(undefined, '/api/generate');

  /** @type {Record<string, unknown>} */
  const body = {
    model: opts.model ?? cfg.model,
    prompt: opts.prompt,
    stream: false,
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
  };

  if (opts.debugResult) {
    // eslint-disable-next-line no-console
    console.log('→ Ollama generate', endpoint, JSON.stringify(body, null, 2));
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (opts.debugResult) {
    // eslint-disable-next-line no-console
    console.log('← Ollama generate', JSON.stringify(json, null, 2));
  }

  if (!json || typeof json.response !== 'string') {
    throw new Error('Ollama response did not contain a “response” field.');
  }
  return json.response;
}

/* -------------------------------------------------------------------------- */
/* Public API – embeddings                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Obtain an embedding vector from Ollama.
 *
 * @param {object}  cfg
 * @param {string=} cfg.embed_endpoint Optional embeddings endpoint.
 * @param {string=} cfg.embed_model    Default embedding model.
 * @param {object}  opts
 * @param {string|string[]} opts.prompt Text or array of texts to embed.
 * @param {string=}        opts.model   Per-call model override.
 * @param {boolean=}       opts.debugResult Emit console logs.
 * @returns {Promise<number[] | number[][]>}
 */
async function getEmbedding(cfg, opts) {
  const fetch = await getFetch();

  const endpoint =
    opts.endpoint ?? cfg.embed_endpoint ?? url(undefined, '/api/embeddings');

  const model = opts.model ?? cfg.embed_model ?? cfg.model;

  /** Helper to call the endpoint for a single string. */
  async function embedOne(text) {
    const body = { model, prompt: text };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!json || !Array.isArray(json.embedding)) {
      throw new Error('Ollama embedding response malformed.');
    }
    return json.embedding;
  }

  if (Array.isArray(opts.prompt)) {
    const out = [];
    for (const p of opts.prompt) {
      // eslint-disable-next-line no-await-in-loop
      out.push(await embedOne(p));
    }
    return out;
  }

  return embedOne(opts.prompt);
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = {
  getCompletion,
  getEmbedding,
};