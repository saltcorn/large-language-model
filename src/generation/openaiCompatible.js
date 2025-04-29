/**
 * @fileoverview
 * OpenAI-compatible completions & embeddings (Azure OpenAI, local replicas,
 * FastChat, etc.).  The module now resolves its `fetch` implementation
 * dynamically to maintain compatibility with both Node 16 (CommonJS) and
 * Node ≥ 18 (global fetch) without triggering the ESM loading error that occurs
 * when `node-fetch` is `require`d directly.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  29 April 2025 – dynamic fetch resolver
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const getFetch = require('../utils/getFetch'); // Path is relative to /src/generation

/* -------------------------------------------------------------------------- */
/* Helper ­functions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Build HTTP headers for OpenAI-style compatible APIs.
 *
 * @param {object} cfg
 * @param {string=} cfg.bearer  Bearer-token value (sent in `Authorization`)
 * @param {string=} cfg.apiKey  Some providers (e.g. Azure OpenAI) expect this
 *                              as `api-key` header instead.
 * @returns {Record<string, string>}
 */
function buildHeaders({ bearer, apiKey }) {
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (apiKey) headers['api-key'] = apiKey;
  return headers;
}

/**
 * Normalise the heterogeneous response shapes returned by various compatible
 * back-ends.
 *
 * @param {*} body Parsed JSON body.
 * @returns {string | object}
 * @throws {Error} When the server reports an error.
 */
function normaliseChatResponse(body) {
  if (body?.error) {
    throw new Error(`OpenAI-compatible error: ${body.error.message}`);
  }

  const message = body?.choices?.[0]?.message;
  if (!message) {
    return '';
  }

  return message.tool_calls
    ? { tool_calls: message.tool_calls, content: message.content ?? null }
    : message.content ?? '';
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Chat completions endpoint.
 *
 * @param {object} cfg
 * @param {string}   cfg.chatCompleteEndpoint Absolute URL of the chat endpoint.
 * @param {string=}  cfg.bearer               Bearer token.
 * @param {string=}  cfg.apiKey               API-key header (Azure style).
 * @param {string=}  cfg.model                Default model ID.
 * @param {object}   opts                     User-supplied options / overrides.
 * @returns {Promise<string | object>}
 */
async function getCompletion(cfg, opts) {
  const fetch = await getFetch();

  const {
    chatCompleteEndpoint,
    bearer,
    apiKey,
    model: defaultModel,
  } = cfg;

  const {
    prompt,
    systemPrompt,
    temperature,
    chat = [],
    debugResult,
    ...rest
  } = opts;

  /** @type {Record<string, unknown>} */
  const reqBody = {
    model: rest.model ?? defaultModel,
    messages: [
      { role: 'system', content: systemPrompt ?? 'You are a helpful assistant.' },
      ...chat,
      { role: 'user', content: prompt },
    ],
    temperature: temperature ?? 0.7,
    ...rest,
  };

  if (debugResult) {
    // eslint-disable-next-line no-console
    console.log(
      'OpenAI-compatible request →',
      chatCompleteEndpoint,
      JSON.stringify(reqBody, null, 2),
    );
  }

  const res  = await fetch(chatCompleteEndpoint, {
    method : 'POST',
    headers: buildHeaders({ bearer, apiKey }),
    body   : JSON.stringify(reqBody),
  });
  const body = await res.json();

  if (debugResult) {
    // eslint-disable-next-line no-console
    console.log('OpenAI-compatible response ←', JSON.stringify(body, null, 2));
  }

  return normaliseChatResponse(body);
}

/**
 * Embeddings endpoint.
 *
 * @param {object} cfg
 * @param {string}   cfg.embeddingsEndpoint Absolute URL of the embeddings route.
 * @param {string=}  cfg.bearer             Bearer token.
 * @param {string=}  cfg.apiKey             API-key header (Azure style).
 * @param {string=}  cfg.embed_model        Default embedding model ID.
 * @param {object}   opts
 * @param {string|string[]} opts.prompt     Input(s) to embed.
 * @param {string=}        opts.model       Override model.
 * @param {boolean=}       opts.debugResult Enable console logging.
 * @returns {Promise<number[] | number[][]>}
 */
async function getEmbedding(cfg, opts) {
  const fetch = await getFetch();

  const {
    embeddingsEndpoint,
    bearer,
    apiKey,
    embed_model: defaultModel,
  } = cfg;

  const { prompt, model, debugResult } = opts;

  /** @type {Record<string, unknown>} */
  const reqBody = {
    model: model ?? defaultModel ?? 'text-embedding-3-small',
    input: prompt,
  };

  if (debugResult) {
    // eslint-disable-next-line no-console
    console.log(
      'OpenAI-compatible (embeddings) request →',
      embeddingsEndpoint,
      JSON.stringify(reqBody, null, 2),
    );
  }

  const res  = await fetch(embeddingsEndpoint, {
    method : 'POST',
    headers: buildHeaders({ bearer, apiKey }),
    body   : JSON.stringify(reqBody),
  });
  const body = await res.json();

  if (debugResult) {
    // eslint-disable-next-line no-console
    console.log('OpenAI-compatible (embeddings) response ←', JSON.stringify(body, null, 2));
  }

  if (body?.error) {
    throw new Error(`OpenAI-compatible error: ${body.error.message}`);
  }

  return Array.isArray(prompt)
    ? body?.data?.map((d) => d?.embedding)
    : body?.data?.[0]?.embedding;
}

module.exports = { getCompletion, getEmbedding };