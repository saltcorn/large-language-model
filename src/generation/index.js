/**
 * src/generation/index.js
 *
 * Facade exposing `getCompletion` & `getEmbedding` while routing
 * the call to the correct backend implementation.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const openai = require('./openai');
const ollama = require('./ollama');
const llamaCpp = require('./llamaCpp');
const vertex = require('./googleVertex');

/* -------------------------------------------------------------------------- */
/* Dispatcher                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Return a completion from the configured backend.
 *
 * @param {import('../types').PluginConfig} cfg
 * @param {object} opts
 * @returns {Promise<string|object>}
 */
async function getCompletion(cfg, opts) {
  switch (cfg.backend) {
    case 'OpenAI':
      return openai.getCompletion(
        {
          chatCompleteEndpoint: 'https://api.openai.com/v1/chat/completions',
          bearer: opts.api_key ?? cfg.api_key,
          apiKey: opts.api_key ?? undefined,
          model: opts.model ?? cfg.model,
        },
        opts,
      );

    case 'OpenAI-compatible API':
      return openai.getCompletion(
        {
          chatCompleteEndpoint: opts.endpoint ?? cfg.endpoint,
          bearer: opts.bearer ?? opts.api_key ?? cfg.bearer_auth,
          apiKey: opts.api_key ?? cfg.api_key,
          model: opts.model ?? cfg.model,
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

/**
 * Return an embedding vector from the configured backend.
 *
 * @param {import('../types').PluginConfig} cfg
 * @param {object} opts
 * @returns {Promise<number[]|number[][]>}
 */
async function getEmbedding(cfg, opts) {
  switch (cfg.backend) {
    case 'OpenAI':
      return openai.getEmbedding(
        {
          embeddingsEndpoint: 'https://api.openai.com/v1/embeddings',
          bearer: opts.api_key ?? cfg.api_key,
          embed_model: opts.model ?? cfg.embed_model,
        },
        opts,
      );

    case 'OpenAI-compatible API':
      return openai.getEmbedding(
        {
          embeddingsEndpoint: opts.endpoint ?? cfg.embed_endpoint,
          bearer: opts.bearer ?? opts.api_key ?? cfg.bearer_auth,
          apiKey: opts.api_key ?? cfg.api_key,
          embed_model: opts.model ?? cfg.embed_model ?? cfg.model,
        },
        opts,
      );

    case 'Local Ollama':
      // Use remote endpoint if provided; otherwise local API
      if (cfg.embed_endpoint) {
        return openai.getEmbedding(
          {
            embeddingsEndpoint: cfg.embed_endpoint,
            embed_model: opts.model ?? cfg.embed_model ?? cfg.model,
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

module.exports = { getCompletion, getEmbedding };