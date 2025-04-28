/**
 * src/generation/ollama.js
 *
 * Local Ollama completions & embeddings.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

const { getState } = require('@saltcorn/data/db/state');

let Ollama;
/**
 * Lazy-load the ESM-only `ollama` package.
 *
 * @throws {Error} if ESM plug-ins are disabled.
 * @returns {import('ollama').Ollama}
 */
function lazyLoadOllama() {
  if (!Ollama) {
    const { features } = getState();
    if (!features.esm_plugins) {
      throw new Error('Ollama requires “esm_plugins” feature.');
    }
    // eslint-disable-next-line global-require
    ({ Ollama } = require('ollama'));
  }
  return new Ollama();
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Generate text using the local Ollama server.
 *
 * @param {object} cfg – plug-in configuration
 * @param {object} opts – generation options forwarded to Ollama
 * @returns {Promise<string>}
 */
async function getCompletion(_cfg, opts) {
  const client = lazyLoadOllama();
  const { response } = await client.generate({
    model: opts.model,
    ...opts,
  });
  return response;
}

/**
 * Obtain an embedding vector from Ollama.
 *
 * @param {object} _cfg – plug-in configuration
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string=} opts.model
 * @returns {Promise<number[]>}
 */
async function getEmbedding(_cfg, opts) {
  const client = lazyLoadOllama();
  const { embedding } = await client.embeddings({
    model: opts.model,
    prompt: opts.prompt,
  });
  return embedding;
}

module.exports = { getCompletion, getEmbedding };