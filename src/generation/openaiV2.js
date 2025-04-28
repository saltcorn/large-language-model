/**
 * src/generation/openaiV2.js
 *
 * Data-driven OpenAI client that derives everything (end-point,
 * payload shapes, allowed parameters, limits, …) from
 * models-openai.json via the registry layer.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Created:  28 Apr 2025
 * Updated:  28 Apr 2025 – add image-generation helper with validation
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const fetch = require('node-fetch');
const registry = require('../openaiRegistry');

/* -------------------------------------------------------------------------- */
/* Generic helpers – shared across all OpenAI endpoints                       */
/* -------------------------------------------------------------------------- */

/**
 * Build HTTP headers for OpenAI-style APIs.
 *
 * @param {{ bearer?:string, apiKey?:string }} cfg
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
 * Clamp a number to a min/max range if provided.
 *
 * @param {number|undefined} n
 * @param {{min?:number,max?:number}=} range
 * @returns {number|undefined}
 */
function clamp(n, { min = 1, max } = {}) {
  if (typeof n !== 'number') return undefined;
  if (typeof min === 'number' && n < min) return min;
  if (typeof max === 'number' && n > max) return max;
  return n;
}

/**
 * Copy only whitelisted keys from src → out.
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
/* Payload builder – /v1/chat/completions                                     */
/* -------------------------------------------------------------------------- */

/**
 * Build request body for chat completions.
 *
 * @param {string} id
 * @param {import('../openaiRegistry').ModelMeta} meta
 * @param {Record<string,unknown>} opts
 * @returns {Record<string,unknown>}
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

  body.max_output_tokens = clamp(body.max_output_tokens, {
    max: meta.maxOutputTokens,
  });

  return body;
}

/* -------------------------------------------------------------------------- */
/* Payload builder – /v1/responses (o-series, GPT-4.5 …)                      */
/* -------------------------------------------------------------------------- */

function buildResponsesPayload(id, meta, opts) {
  const sysRole = meta.reasoningRequired ? 'developer' : 'system';

  /** @type {Array<{role:string,content:Array<{type:string,text:string}>}>} */
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

  /** @type {Record<string,unknown>} */
  const body = {
    model: id,
    input,
    text: { format: { type: 'text' } },
    tools: opts.tools ?? [],
    store: typeof opts.store === 'boolean' ? opts.store : true,
    ...pickParams(meta.supportedParams, opts),
  };

  /* Reasoning block ----------------------------------------------------- */
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

  /* Structured / other output formats ---------------------------------- */
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
/* Image helper – schema-aware validation & building                          */
/* -------------------------------------------------------------------------- */

/**
 * Throw when a value is not allowed by the model’s postParameters schema.
 *
 * @param {string} name
 * @param {unknown} schema
 * @param {unknown} value
 */
function validatePostValue(name, schema, value) {
  /* ----------- Enumerated (array or oneOf) ----------------------------- */
  if (Array.isArray(schema) || Array.isArray(schema?.oneOf)) {
    const allowed = Array.isArray(schema) ? schema : schema.oneOf;
    if (!allowed.includes(value)) {
      throw new Error(
        `Invalid value for “${name}”. Allowed: ${allowed.join(', ')}`,
      );
    }
    return;
  }

  /* ----------- Numeric range ------------------------------------------ */
  if (typeof schema === 'object' && (schema.min !== undefined || schema.max !== undefined)) {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`“${name}” must be numeric.`);
    if (schema.min !== undefined && n < schema.min) {
      throw new Error(`“${name}” must be ≥ ${schema.min}.`);
    }
    if (schema.max !== undefined && n > schema.max) {
      throw new Error(`“${name}” must be ≤ ${schema.max}.`);
    }
  }
}

/**
 * Build & validate payload for /v1/images/generations.
 *
 * @param {string} id
 * @param {import('../openaiRegistry').ModelMeta} meta
 * @param {Record<string,unknown>} opts
 * @returns {Record<string,unknown>}
 */
function buildImagePayload(id, meta, opts) {
  if (!opts.prompt) throw new Error('“prompt” is required.');

  const body = {
    model: id,
    prompt: opts.prompt,
    ...pickParams(meta.supportedParams, opts),
  };

  /* Validate against postParameters schema ------------------------------ */
  const schema = meta.postParameters || {};
  for (const [key, val] of Object.entries(body)) {
    if (key === 'model' || key === 'prompt') continue;
    if (!schema[key]) continue; // no schema → accept
    validatePostValue(key, schema[key], val);
  }

  /* Clamp numeric n when schema provides range -------------------------- */
  if (typeof body.n === 'number' && schema.n) {
    body.n = clamp(body.n, schema.n);
  }

  return body;
}

/* -------------------------------------------------------------------------- */
/* Public API – getCompletion (chat / responses)                              */
/* -------------------------------------------------------------------------- */

/**
 * Chat or responses completion.
 *
 * @param {{ bearer?:string, apiKey?:string, model?:string }} cfg
 * @param {Record<string,unknown>} opts
 * @returns {Promise<string|object>}
 */
async function getCompletion(cfg, opts) {
  const modelId = /** @type {string} */ (opts.model ?? cfg.model);
  if (!modelId) throw new Error('No OpenAI model supplied.');

  const meta = registry.getMeta(modelId);
  if (!meta) throw new Error(`Unknown OpenAI model “${modelId}”.`);

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
    // eslint-disable-next-line no-console
    console.log('→ OpenAI request', url, JSON.stringify(body, null, 2));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(cfg),
    body: JSON.stringify(body),
  });
  const json = await res.json();

  if (opts.debugResult) {
    // eslint-disable-next-line no-console
    console.log('← OpenAI response', JSON.stringify(json, null, 2));
  }

  if (json.error) throw new Error(`OpenAI error: ${json.error.message}`);

  /* Normalise return shape ---------------------------------------------- */
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
/* Public API – getEmbedding                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Embedding helper (payload unchanged, but still metadata-driven).
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
/* Public API – generateImage                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Generate image(s) via OpenAI Images endpoint.
 *
 * @param {{ bearer?:string, apiKey?:string, model?:string }} cfg
 * @param {Record<string,unknown>} opts
 * @returns {Promise<object>} raw JSON response
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
  generateImage, // ← NEW export
};