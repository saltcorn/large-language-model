/**
 * src/generation/openaiV2.js
 *
 * Data-driven OpenAI client that derives everything (end-point,
 * payload shape, allowed parameters, limits, …) from
 * models-openai.json via the registry layer.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Created:  29 Apr 2025
 * Updated:  02 May 2025 – add image-generation helper (validates
 *           against each model’s postParameters schema).  No
 *           previously-existing code has been removed.
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const fetch    = require('node-fetch');
const registry = require('../openaiRegistry');

/* -------------------------------------------------------------------------- */
/* Helpers (shared)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Build HTTP headers for OpenAI-style APIs.
 *
 * @param {{bearer?: string, apiKey?: string}} cfg
 * @returns {Record<string, string>}
 */
function buildHeaders({ bearer, apiKey }) {
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (apiKey) headers['api-key'] = apiKey; /* Azure header style */
  return headers;
}

/**
 * Clamp an integer to the supplied range.
 *
 * @param {number|undefined} n
 * @param {{min?: number, max?: number}=} range
 * @returns {number|undefined}
 */
function clamp(n, { min = 1, max } = {}) {
  if (typeof n !== 'number') return undefined;
  if (typeof min === 'number' && n < min) return min;
  if (typeof max === 'number' && n > max) return max;
  return n;
}

/**
 * Extract only whitelisted keys from `src`.
 *
 * @param {string[]} list
 * @param {Record<string, unknown>} src
 * @returns {Record<string, unknown>}
 */
function pickParams(list, src) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of list) {
    if (typeof src[k] !== 'undefined') out[k] = src[k];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Payload builders – chat & responses (UNCHANGED)                            */
/* -------------------------------------------------------------------------- */

function buildChatPayload(id, meta, opts) {
  const sys = opts.systemPrompt ?? 'You are a helpful assistant.';
  const messages = [
    { role: 'system', content: sys },
    ...(opts.chat ?? []),
    { role: 'user', content: opts.prompt },
  ];

  /** @type {Record<string, unknown>} */
  const body = {
    model: id,
    messages,
    ...pickParams(meta.supportedParams, opts),
  };

  body.max_output_tokens = clamp(body.max_output_tokens, {
    max: meta.maxOutputTokens,
  });

  return body;
}

function buildResponsesPayload(id, meta, opts) {
  const sysRole = meta.reasoningRequired ? 'developer' : 'system';

  const input = [
    {
      role: sysRole,
      content: [
        {
          type: 'input_text',
          text: opts.systemPrompt ?? 'You are a helpful assistant.',
        },
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

  /** @type {Record<string, unknown>} */
  const body = {
    model: id,
    input,
    text: { format: { type: 'text' } },
    tools: opts.tools ?? [],
    store: typeof opts.store === 'boolean' ? opts.store : true,
    ...pickParams(meta.supportedParams, opts),
  };

  if (
    meta.reasoningRequired ||
    opts['reasoning.effort'] ||
    opts['reasoning.summary']
  ) {
    body.reasoning = {
      effort: opts['reasoning.effort'] ?? 'auto',
      summary: opts['reasoning.summary'] ?? 'auto',
    };
  }

  if (opts.text) {
    body.text = opts.text;
  } else if (opts.output_format) {
    body.text = { format: opts.output_format };
  }

  body.max_output_tokens = clamp(body.max_output_tokens, {
    max: meta.maxOutputTokens,
  });

  return body;
}

/* -------------------------------------------------------------------------- */
/* Completion (UNCHANGED)                                                     */
/* -------------------------------------------------------------------------- */

async function getCompletion(cfg, opts) {
  const modelId = /** @type {string} */ (opts.model ?? cfg.model);
  if (!modelId) throw new Error('No OpenAI model supplied.');

  const meta = registry.getMeta(modelId);
  if (!meta) throw new Error(`Unknown OpenAI model “${modelId}”.`);

  const useResponses =
    !!meta.endpoints?.responses && meta.category !== 'chat';
  const endpointPath = useResponses
    ? meta.endpoints.responses
    : meta.endpoints.chat;

  if (!endpointPath) {
    throw new Error(
      `Model “${modelId}” does not expose a usable endpoint.`,
    );
  }

  const url = `https://api.openai.com/${endpointPath}`;
  const body = useResponses
    ? buildResponsesPayload(modelId, meta, opts)
    : buildChatPayload(modelId, meta, opts);

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (json.error) throw new Error(`OpenAI error: ${json.error.message}`);

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

/* -------------------------------------------------------------------------- */
/* Embedding (UNCHANGED)                                                      */
/* -------------------------------------------------------------------------- */

async function getEmbedding(cfg, opts) {
  const modelId = /** @type {string} */ (opts.model ?? cfg.embed_model);
  if (!modelId) throw new Error('No embedding model supplied.');

  const meta = registry.getMeta(modelId);
  if (!meta) throw new Error(`Unknown OpenAI model “${modelId}”.`);

  const endpointPath = meta.endpoints?.embeddings ?? 'v1/embeddings';
  const url = `https://api.openai.com/${endpointPath}`;

  const body = { model: modelId, input: opts.prompt };

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
/* ----------------  NEW:  IMAGE-GENERATION  -------------------------------- */
/* -------------------------------------------------------------------------- */

/**
 * Validate a value against a post-parameter schema fragment.
 *
 * @param {string} key
 * @param {unknown} spec
 * @param {unknown} val
 */
function validatePostValue(key, spec, val) {
  /* Enumerations --------------------------------------------------------- */
  if (Array.isArray(spec) || Array.isArray(spec?.oneOf)) {
    const allowed = Array.isArray(spec) ? spec : spec.oneOf;
    if (!allowed.includes(val)) {
      throw new Error(
        `Invalid value for “${key}”. Must be one of: ${allowed.join(', ')}`,
      );
    }
    return;
  }

  /* Min / max range ------------------------------------------------------ */
  if (
    typeof spec === 'object' &&
    (spec.min !== undefined || spec.max !== undefined)
  ) {
    const num = Number(val);
    if (Number.isNaN(num)) throw new Error(`“${key}” must be numeric.`);
    if (spec.min !== undefined && num < spec.min) {
      throw new Error(`“${key}” must be ≥ ${spec.min}.`);
    }
    if (spec.max !== undefined && num > spec.max) {
      throw new Error(`“${key}” must be ≤ ${spec.max}.`);
    }
  }
}

/**
 * Build and validate payload for /v1/images/generations.
 *
 * @param {string} id
 * @param {import('../openaiRegistry').ModelMeta} meta
 * @param {Record<string, unknown>} opts
 * @returns {Record<string, unknown>}
 */
function buildImagePayload(id, meta, opts) {
  if (!opts.prompt) throw new Error('“prompt” is required for image generation.');

  /** @type {Record<string, unknown>} */
  const body = {
    model: id,
    prompt: opts.prompt,
    ...pickParams(meta.supportedParams, opts),
  };

  const spec = meta.postParameters || {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'model' || k === 'prompt') continue;
    if (spec[k]) validatePostValue(k, spec[k], v);
  }

  if (typeof body.n === 'number' && spec.n) {
    body.n = clamp(body.n, spec.n);
  }

  return body;
}

/**
 * Generate image(s) via OpenAI Images endpoint.
 *
 * @param {{bearer?:string, apiKey?:string, model?:string}} cfg
 * @param {Record<string, unknown>} opts
 * @returns {Promise<object>} Raw JSON
 */
async function generateImage(cfg, opts) {
  const modelId = /** @type {string} */ (opts.model ?? cfg.model);
  if (!modelId) throw new Error('No OpenAI image model supplied.');

  const meta = registry.getMeta(modelId);
  if (!meta || meta.category !== 'image') {
    throw new Error(`Model “${modelId}” is not an image model.`);
  }

  const endpointPath =
    meta.endpoints?.image_generation ?? 'v1/images/generations';
  const url = `https://api.openai.com/${endpointPath}`;

  const body = buildImagePayload(modelId, meta, opts);

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (json.error) throw new Error(`OpenAI error: ${json.error.message}`);
  return json;
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = {
  getCompletion,
  getEmbedding,
  generateImage, // NEW export
};