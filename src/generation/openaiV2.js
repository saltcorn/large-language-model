/**
 * src/generation/openaiV2.js
 *
 * Data-driven OpenAI client that derives everything (end-point,
 * payload shape, allowed parameters, limits, …) from
 * models-openai.json via the registry layer.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Created:  29 Apr 2025
 * Updated:  30 Apr 2025 – allow caller-supplied non-text “format”
 *                         blocks for /responses payloads
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const fetch = require('node-fetch');
const registry = require('../openaiRegistry');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build HTTP headers for OpenAI-style APIs.
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
  if (apiKey) headers['api-key'] = apiKey; // Azure header style
  return headers;
}

/**
 * Clamp an integer value to 1…max (if max supplied).
 *
 * @param {number|undefined} n
 * @param {number|undefined} max
 * @returns {number|undefined}
 */
function clamp(n, max) {
  if (typeof n !== 'number') return undefined;
  if (typeof max === 'number' && n > max) return max;
  if (n < 1) return 1;
  return n;
}

/**
 * Extract only the whitelisted keys from src.
 *
 * @param {string[]} whitelist
 * @param {Record<string,unknown>} src
 * @returns {Record<string,unknown>}
 */
function pickParams(whitelist, src) {
  /** @type {Record<string,unknown>} */
  const out = {};
  for (const key of whitelist) {
    if (typeof src[key] !== 'undefined') out[key] = src[key];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Payload builders                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Build payload for /chat/completions.
 */
function buildChatPayload(id, meta, opts) {
  const sys = opts.systemPrompt ?? 'You are a helpful assistant.';
  const messages = [
    { role: 'system', content: sys },
    ...(opts.chat ?? []),
    { role: 'user', content: opts.prompt },
  ];

  /** @type {Record<string,unknown>} */
  const body = {
    model: id,
    messages,
    ...pickParams(meta.supportedParams, opts),
  };

  body.max_output_tokens = clamp(body.max_output_tokens, meta.maxOutputTokens);

  return body;
}

/**
 * Build payload for /responses  (GPT-4.5, o-series …).
 */
function buildResponsesPayload(id, meta, opts) {
  /** ---------------- input messages ---------------- */
  const sysRole = meta.reasoningRequired ? 'developer' : 'system';
  const input = [
    {
      role: sysRole,
      content: [
        { type: 'input_text', text: opts.systemPrompt ?? 'You are a helpful assistant.' },
      ],
    },
    ...(opts.chat ?? []).map((m) => ({
      role: m.role,
      content: [{ type: 'input_text', text: m.content }],
    })),
    {
      role: 'user',
      content: [{ type: 'input_text', text: opts.prompt }],
    },
  ];

  /** ---------------- base payload ------------------ */
  /** @type {Record<string,unknown>} */
  const body = {
    model: id,
    input,
    text: { format: { type: 'text' } }, // default – may be overridden below
    tools: opts.tools ?? [],
    store: typeof opts.store === 'boolean' ? opts.store : true,
    ...pickParams(meta.supportedParams, opts),
  };

  /* Optional reasoning block */
  if (meta.reasoningRequired || opts['reasoning.effort'] || opts['reasoning.summary']) {
    body.reasoning = {
      effort: opts['reasoning.effort'] ?? 'auto',
      summary: opts['reasoning.summary'] ?? 'auto',
    };
  }

  /* Allow caller to request a non-text format ---------------------------- */
  if (opts.text) {
    body.text = opts.text;
  } else if (opts.output_format) {
    body.text = { format: opts.output_format };
  }

  body.max_output_tokens = clamp(body.max_output_tokens, meta.maxOutputTokens);

  return body;
}

/* -------------------------------------------------------------------------- */
/* Main public API                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Chat or responses completion.
 *
 * @param {object} cfg
 *   @param {string=} cfg.bearer   Bearer token for “Authorization” header
 *   @param {string=} cfg.apiKey   api-key header (Azure style)
 *   @param {string=} cfg.model    Fallback model
 * @param {Record<string,unknown>} opts
 *   – recognised keys include prompt, chat, systemPrompt, temperature,  
 *     'reasoning.effort', 'reasoning.summary', tools, text, output_format …
 * @returns {Promise<string|object>}
 */
async function getCompletion(cfg, opts) {
  const modelId = /** @type {string} */ (opts.model ?? cfg.model);
  if (!modelId) throw new Error('No OpenAI model supplied.');

  const meta = registry.getMeta(modelId);
  if (!meta) throw new Error(`Unknown OpenAI model “${modelId}”.`);

  /* ---------- endpoint & payload --------------------------------------- */
  const useResponses = !!meta.endpoints?.responses && meta.category !== 'chat';
  const endpointPath = useResponses
    ? meta.endpoints.responses
    : meta.endpoints.chat;

  if (!endpointPath) {
    throw new Error(`Model “${modelId}” does not expose a usable endpoint.`);
  }

  const url = `https://api.openai.com/${endpointPath}`;

  const body = useResponses
    ? buildResponsesPayload(modelId, meta, opts)
    : buildChatPayload(modelId, meta, opts);

  if (opts.debugResult) {
    /* eslint-disable no-console */
    console.log('→ OpenAI request', url, JSON.stringify(body, null, 2));
  }

  /* ---------------- HTTP ------------------------------------------------ */
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (opts.debugResult) {
    /* eslint-disable no-console */
    console.log('← OpenAI response', JSON.stringify(json, null, 2));
  }

  if (json.error) throw new Error(`OpenAI error: ${json.error.message}`);

  /* --------------- normalise return shape ------------------------------- */
  if (json.choices?.[0]?.message) {
    const m = json.choices[0].message;
    return m.tool_calls
      ? { tool_calls: m.tool_calls, content: m.content ?? null }
      : m.content ?? '';
  }
  if (json.candidates?.[0]?.content?.parts) {
    return json.candidates[0].content.parts[0]?.text ?? '';
  }

  return '';
}

/**
 * Embedding helper (payload unchanged, but metadata-driven).
 */
async function getEmbedding(cfg, opts) {
  const modelId = /** @type {string} */ (opts.model ?? cfg.embed_model);
  if (!modelId) throw new Error('No embedding model supplied.');

  const meta = registry.getMeta(modelId);
  if (!meta) throw new Error(`Unknown OpenAI model “${modelId}”.`);

  const endpointPath = meta.endpoints?.embeddings ?? 'v1/embeddings';
  const url = `https://api.openai.com/${endpointPath}`;

  const body = {
    model: modelId,
    input: opts.prompt,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (json.error) throw new Error(`OpenAI error: ${json.error.message}`);

  return Array.isArray(opts.prompt)
    ? json.data.map((d) => d.embedding)
    : json.data[0].embedding;
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = { getCompletion, getEmbedding };