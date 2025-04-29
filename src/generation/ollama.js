/**
 * @fileoverview
 * Local Ollama completions & embeddings.  The upstream `ollama` NPM package is
 * **ES-module only**; attempting to `require()` it in a CommonJS context causes
 * a runtime failure.  This revision loads the module dynamically with
 * `import()` and therefore works under both Node 16 (CJS) and Node ≥ 18.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  29 April 2025 – dynamic ESM loading
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const { getState } = require('@saltcorn/data/db/state');

/* -------------------------------------------------------------------------- */
/* Lazy loader for the ESM-only `ollama` package                              */
/* -------------------------------------------------------------------------- */

/**
 * Cached constructor reference.
 *
 * @type {typeof import('ollama').Ollama | undefined}
 */
let OllamaCtor;

/**
 * Dynamically import the `ollama` module when first required.
 *
 * @throws {Error} If Saltcorn’s `esm_plugins` feature flag is disabled.
 * @returns {Promise<import('ollama').Ollama>} Instantiated client.
 */
async function loadOllama() {
  if (!OllamaCtor) {
    const { features } = getState();
    if (!features?.esm_plugins) {
      throw new Error('Ollama backend requires Saltcorn feature flag “esm_plugins”.');
    }

    // Dynamic import sidesteps the CommonJS ⇒ ESM loader error.
    const mod = await import('ollama');
    OllamaCtor = mod.Ollama;
  }

  return new OllamaCtor();
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Generate text using the local Ollama server.
 *
 * @param {object} _cfg  Plug-in configuration (unused at present).
 * @param {object} opts  Options forwarded to Ollama.
 * @returns {Promise<string>}
 */
async function getCompletion(_cfg, opts) {
  const client = await loadOllama();
  const { response } = await client.generate({
    model: opts.model,
    ...opts,
  });
  return response;
}

/**
 * Obtain an embedding vector from Ollama.
 *
 * @param {object} _cfg  Plug-in configuration (unused).
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string=} opts.model
 * @returns {Promise<number[]>}
 */
async function getEmbedding(_cfg, opts) {
  const client = await loadOllama();
  const { embedding } = await client.embeddings({
    model: opts.model,
    prompt: opts.prompt,
  });
  return embedding;
}

module.exports = { getCompletion, getEmbedding };