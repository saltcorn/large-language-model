/**
 * src/generation/index.js
 *
 * Facade exposing generation helpers while routing calls to the correct
 * backend implementation.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 02 May 2025 – add image-generation dispatcher
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const openaiV2         = require('./openaiV2');
const openaiCompatible = require('./openaiCompatible');
const ollama           = require('./ollama');
const llamaCpp         = require('./llamaCpp');
const vertex           = require('./googleVertex');

/* -------------------------------------------------------------------------- */
/* Dispatcher – text completion                                               */
/* -------------------------------------------------------------------------- */

/**
 * Obtain a chat / text completion from whichever backend is configured.
 *
 * @param {object} cfg  – plug-in configuration
 * @param {object} opts – user-supplied options (prompt, model override, …)
 * @returns {Promise<string|object>}
 */
async function getCompletion(cfg, opts) {
  switch (cfg.backend) {
    case 'OpenAI':
      return openaiV2.getCompletion(
        {
          bearer: opts.api_key ?? cfg.api_key,
          apiKey: opts.api_key ?? undefined,
          model : opts.model ?? cfg.model,
        },
        opts,
      );

    case 'OpenAI-compatible API':
      return openaiCompatible.getCompletion(
        {
          chatCompleteEndpoint: opts.endpoint ?? cfg.endpoint,
          bearer              : opts.bearer ?? opts.api_key ?? cfg.bearer_auth,
          apiKey              : opts.api_key ?? cfg.api_key,
          model               : opts.model ?? cfg.model,
        },
        opts,
      );

    case 'Local Ollama':
      return ollama.getCompletion(cfg, opts);

    case 'Local llama.cpp':
      return llamaCpp.getCompletion(cfg, opts);

    case 'Google Vertex AI':
      return vertex.getCompletion(cfg, opts);

    default:
      throw new Error(`Unsupported backend “${cfg.backend}”.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatcher – embeddings                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Get vector embeddings for text (or array of texts).
 *
 * @returns {Promise<number[]|number[][]>}
 */
async function getEmbedding(cfg, opts) {
  switch (cfg.backend) {
    case 'OpenAI':
      return openaiV2.getEmbedding(
        {
          bearer     : opts.api_key ?? cfg.api_key,
          apiKey     : opts.api_key ?? undefined,
          embed_model: opts.model ?? cfg.embed_model,
        },
        opts,
      );

    case 'OpenAI-compatible API':
      return openaiCompatible.getEmbedding(
        {
          embeddingsEndpoint: opts.endpoint ?? cfg.embed_endpoint,
          bearer            : opts.bearer ?? opts.api_key ?? cfg.bearer_auth,
          apiKey            : opts.api_key ?? cfg.api_key,
          embed_model       : opts.model ?? cfg.embed_model ?? cfg.model,
        },
        opts,
      );

    case 'Local Ollama':
      if (cfg.embed_endpoint) {
        return openaiCompatible.getEmbedding(
          {
            embeddingsEndpoint: cfg.embed_endpoint,
            embed_model       : opts.model ?? cfg.embed_model ?? cfg.model,
          },
          opts,
        );
      }
      return ollama.getEmbedding(cfg, opts);

    case 'Google Vertex AI':
      return vertex.getEmbedding(cfg, opts);

    default:
      throw new Error(`Embedding not implemented for backend “${cfg.backend}”.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatcher – image generation (OpenAI only)                                */
/* -------------------------------------------------------------------------- */

/**
 * Generate image(s) using an OpenAI image model (DALL·E 2/3, GPT-Image 1, …).
 * The caller must supply a `prompt`.  Any additional keys allowed by the
 * selected model (size, n, style, …) may be included in `opts`.
 *
 * NOTE: This helper is only available when the plug-in backend is set to
 *       “OpenAI”.  The configured text model is irrelevant; callers pass the
 *       desired image model via `opts.model` each time.
 *
 * @param {object} cfg  – plug-in configuration
 * @param {object} opts – { prompt:string, model:string, … }
 * @returns {Promise<object>}  Raw JSON as returned by OpenAI
 */
async function generateImage(cfg, opts) {
  if (cfg.backend !== 'OpenAI') {
    throw new Error('Image generation is only available when backend is “OpenAI”.');
  }

  return openaiV2.generateImage(
    {
      bearer: opts.api_key ?? cfg.api_key,
      apiKey: opts.api_key ?? undefined,
      model : opts.model ?? cfg.model,
    },
    opts,
  );
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = {
  getCompletion,
  getEmbedding,
  generateImage,   // ← NEW export
};