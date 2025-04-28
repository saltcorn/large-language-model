/**
 * src/llmFunctions.js
 *
 * Exposes server-side JavaScript functions that Saltcorn users
 * can call from Formulas, Workflows, etc.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const { getCompletion, getEmbedding } = require('./generation');

/* -------------------------------------------------------------------------- */
/* Type-definitions (JSDoc)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Builds the `functions` object required by the plug-in API.
 *
 * @param {import('./types').PluginConfig} config – current plug-in config
 * @returns {object<string, import('@saltcorn/types').SCPluginFunction>}
 */
function buildFunctions(config) {
  return {
    llm_generate: {
      /**
       * Generate text with the configured LLM.
       *
       * @param {string} prompt
       * @param {object=} opts
       * @returns {Promise<string|object>}
       */
      run: async (prompt, opts = {}) =>
        getCompletion(config, { prompt, ...opts }),
      isAsync: true,
      description: 'Generate text with GPT',
      arguments: [{ name: 'prompt', type: 'String' }],
    },

    llm_embedding: {
      /**
       * Obtain an embedding vector for the supplied prompt.
       *
       * @param {string|string[]} prompt
       * @param {object=} opts
       * @returns {Promise<number[]|number[][]>}
       */
      run: async (prompt, opts = {}) =>
        getEmbedding(config, { prompt, ...opts }),
      isAsync: true,
      description: 'Get vector embedding',
      arguments: [{ name: 'prompt', type: 'String' }],
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = buildFunctions;