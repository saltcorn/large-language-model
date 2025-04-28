/**
 * src/generation/openai.js
 *
 * OpenAI / OpenAI-compatible completions & embeddings.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

const fetch = require('node-fetch');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build the HTTP headers for OpenAI-style APIs.
 *
 * @param {object} cfg
 * @param {string=} cfg.bearer
 * @param {string=} cfg.apiKey
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
 * Decide whether the OpenAI response contains a tool-call payload.
 *
 * @param {any} body – JSON returned by the API
 * @returns {string|object}
 */
function normaliseChatResponse(body) {
  if (body.error) {
    throw new Error(`OpenAI error: ${body.error.message}`);
  }

  const message = body?.choices?.[0]?.message;
  if (!message) return '';

  return message.tool_calls
    ? {
        tool_calls: message.tool_calls,
        content: message.content ?? null,
      }
    : message.content ?? '';
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Call the Chat Completions endpoint.
 *
 * @param {object} cfg
 * @param {string} cfg.chatCompleteEndpoint
 * @param {string} cfg.model
 * @param {string=} cfg.bearer
 * @param {string=} cfg.apiKey
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string=} opts.systemPrompt
 * @param {number=} opts.temperature
 * @param {Array<object>=} opts.chat
 * @param {boolean=} opts.debugResult
 * @returns {Promise<string|object>}
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
    console.log(
      'OpenAI request',
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
    console.log('OpenAI response', JSON.stringify(body, null, 2));
  }

  return normaliseChatResponse(body);
}

/**
 * Call the Embeddings endpoint.
 *
 * @param {object} cfg
 * @param {string} cfg.embeddingsEndpoint
 * @param {string} cfg.embed_model
 * @param {string=} cfg.bearer
 * @param {string=} cfg.apiKey
 * @param {object} opts
 * @param {string|string[]} opts.prompt
 * @param {string=} opts.model
 * @param {boolean=} opts.debugResult
 * @returns {Promise<number[]|number[][]>}
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
    console.log('OpenAI response', JSON.stringify(body, null, 2));
  }

  if (body.error) throw new Error(`OpenAI error: ${body.error.message}`);

  return Array.isArray(prompt)
    ? body?.data?.map((d) => d?.embedding)
    : body?.data?.[0]?.embedding;
}

module.exports = { getCompletion, getEmbedding };