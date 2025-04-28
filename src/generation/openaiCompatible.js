/**
 * src/generation/openaiCompatible.js
 *
 * OpenAI-compatible completions & embeddings (Azure-style, local
 * OpenAI-compatible servers, etc.).  This module retains the original
 * “openai.js” logic but is now clearly labelled as the **compatible**
 * API path so it is not confused with the first-party, data-driven
 * implementation in openaiV2.js.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Created: 30 Apr 2025  (renamed from openai.js)
 */

'use strict';

const fetch = require('node-fetch');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build HTTP headers for OpenAI-style compatible APIs.
 *
 * @param {object} cfg
 * @param {string=} cfg.bearer
 * @param {string=} cfg.apiKey
 * @returns {Record<string,string>}
 */
function buildHeaders({ bearer, apiKey }) {
  /** @type {Record<string,string>} */
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (apiKey) headers['api-key'] = apiKey;
  return headers;
}

/**
 * Decide whether the response contains a tool-call payload.
 *
 * @param {any} body
 * @returns {string|object}
 */
function normaliseChatResponse(body) {
  if (body.error) {
    throw new Error(`OpenAI-compatible error: ${body.error.message}`);
  }

  const message = body?.choices?.[0]?.message;
  if (!message) return '';

  return message.tool_calls
    ? { tool_calls: message.tool_calls, content: message.content ?? null }
    : message.content ?? '';
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Call the Chat Completions endpoint.
 */
async function getCompletion(cfg, opts) {
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

  const reqBody = {
    model: rest.model || defaultModel,
    messages: [
      { role: 'system', content: systemPrompt ?? 'You are a helpful assistant.' },
      ...chat,
      { role: 'user', content: prompt },
    ],
    temperature: temperature ?? 0.7,
    ...rest,
  };

  if (debugResult) {
    /* eslint-disable no-console */
    console.log(
      'OpenAI-compatible request',
      JSON.stringify(reqBody, null, 2),
      '→',
      chatCompleteEndpoint,
    );
  }

  const res = await fetch(chatCompleteEndpoint, {
    method: 'POST',
    headers: buildHeaders({ bearer, apiKey }),
    body: JSON.stringify(reqBody),
  });
  const body = await res.json();

  if (debugResult) {
    /* eslint-disable no-console */
    console.log('OpenAI-compatible response', JSON.stringify(body, null, 2));
  }

  return normaliseChatResponse(body);
}

/**
 * Call the Embeddings endpoint.
 */
async function getEmbedding(cfg, opts) {
  const {
    embeddingsEndpoint,
    bearer,
    apiKey,
    embed_model: defaultModel,
  } = cfg;

  const { prompt, model, debugResult } = opts;

  const resBody = {
    model: model ?? defaultModel ?? 'text-embedding-3-small',
    input: prompt,
  };

  const res = await fetch(embeddingsEndpoint, {
    method: 'POST',
    headers: buildHeaders({ bearer, apiKey }),
    body: JSON.stringify(resBody),
  });
  const body = await res.json();

  if (debugResult) {
    /* eslint-disable no-console */
    console.log('OpenAI-compatible response', JSON.stringify(body, null, 2));
  }

  if (body.error) throw new Error(`OpenAI-compatible error: ${body.error.message}`);

  return Array.isArray(prompt)
    ? body?.data?.map((d) => d?.embedding)
    : body?.data?.[0]?.embedding;
}

module.exports = { getCompletion, getEmbedding };