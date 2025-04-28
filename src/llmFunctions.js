/**
 * src/llmFunctions.js
 *
 * Exposes server-side JavaScript functions that Saltcorn users
 * can call from Formulas, Workflows, etc.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Created:  28 Apr 2025
 * Updated:  02 May 2025 – add `llm_generate_image`
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const {
  getCompletion,
  getEmbedding,
  generateImage, // ← NEW import
} = require('./generation');

/* -------------------------------------------------------------------------- */
/* Type-definitions (JSDoc)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Builds the `functions` object required by the plug-in API.
 *
 * @param {import('./types').PluginConfig} config – current plug-in config
 * @returns {Record<string, import('@saltcorn/types').SCPluginFunction>}
 */
function buildFunctions(config) {
  return {
    /* =================================================================== */
    /* 1.  Text generation                                                 */
    /* =================================================================== */
    llm_generate: {
      /**
       * Generate text with the configured LLM.
       *
       * @param {string} prompt
       * @param {Record<string, unknown>=} opts
       * @returns {Promise<string|object>}
       */
      run: async (prompt, opts = {}) =>
        getCompletion(config, { prompt, ...opts }),
      isAsync: true,
      description: 'Generate text with GPT / compatible model',
      arguments: [{ name: 'prompt', type: 'String' }],
    },

    /* =================================================================== */
    /* 2.  Embeddings                                                      */
    /* =================================================================== */
    llm_embedding: {
      /**
       * Obtain an embedding vector for the supplied prompt.
       *
       * @param {string|string[]} prompt
       * @param {Record<string, unknown>=} opts
       * @returns {Promise<number[]|number[][]>}
       */
      run: async (prompt, opts = {}) =>
        getEmbedding(config, { prompt, ...opts }),
      isAsync: true,
      description: 'Get vector embedding',
      arguments: [{ name: 'prompt', type: 'String' }],
    },

    /* =================================================================== */
    /* 3.  Image generation (OpenAI)                                       */
    /* =================================================================== */
    llm_generate_image: {
      /**
       * Generate image(s) using an OpenAI image model (e.g. DALL·E 2/3 or
       * GPT-Image 1).  The configured text model is irrelevant; callers
       * specify the image model via `opts.model`.
       *
       * Example:
       *   await llm_generate_image(
       *     'A cute baby sea otter',
       *     { model: 'dall-e-3', n: 1, size: '1024x1024' }
       *   );
       *
       * All additional keys accepted by the chosen model’s `supportedParams`
       * list in models-openai.json can be supplied in `opts`.
       *
       * @param {string} prompt
       * @param {Record<string, unknown>=} opts
       * @returns {Promise<object>} Raw JSON response from OpenAI
       */
      run: async (prompt, opts = {}) =>
        generateImage(config, { prompt, ...opts }),
      isAsync: true,
      description: 'Generate image(s) with an OpenAI image model',
      arguments: [{ name: 'prompt', type: 'String' }],
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = buildFunctions;