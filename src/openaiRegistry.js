/**
 * src/openaiRegistry.js
 *
 * Centralised read-only registry for OpenAI models.
 * -------------------------------------------------
 * • Loads models-openai.json once per process.
 * • Exposes helpers for model look-ups, listings and endpoint discovery.
 * • Provides `unknownParams()` so the UI can surface parameters for which
 *   we do not yet have first-class widgets.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Created: 29 Apr 2025
 * Updated: 01 May 2025 – add `unknownParams` helper
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const fs   = require('fs');
const path = require('path');

/* -------------------------------------------------------------------------- */
/* Internal cache                                                             */
/* -------------------------------------------------------------------------- */

/** @typedef {import('../models-openai.json').models[number]} ModelMeta */

/**
 * Cached array of metadata objects.
 * @type {ReadonlyArray<ModelMeta> | null}
 */
let _cached = null;

/* -------------------------------------------------------------------------- */
/* Loader                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse and cache the JSON file on first access.
 *
 * @returns {ReadonlyArray<ModelMeta>}
 * @throws  {Error} when the JSON is missing or malformed.
 */
function loadAll() {
  if (_cached) return _cached;

  const jsonPath = path.join(__dirname, '..', 'models-openai.json');
  /** @type {{models: ModelMeta[]}} */
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  if (!Array.isArray(data.models)) {
    throw new Error('models-openai.json: expected top-level “models” array.');
  }

  /* Freeze array & elements so callers cannot mutate the cache. */
  _cached = Object.freeze(data.models.map((m) => Object.freeze({ ...m })));
  return _cached;
}

/* -------------------------------------------------------------------------- */
/* Public helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Alphabetically-sorted list of all model IDs.
 *
 * @returns {string[]}
 */
function listModels() {
  return loadAll()
    .map((m) => m.id)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Return full metadata for a given model ID.
 *
 * @param   {string} id
 * @returns {ModelMeta | undefined}
 */
function getMeta(id) {
  return loadAll().find((m) => m.id === id);
}

/**
 * List every model whose `category` equals `category`.
 *
 * @param   {string} category  e.g. “chat”, “embedding”
 * @returns {ModelMeta[]}
 */
function listByCategory(category) {
  return loadAll().filter((m) => m.category === category);
}

/**
 * Convenience – retrieve the relative endpoint path for an operation.
 * Falls back to `undefined` when the model does not expose that endpoint.
 *
 * @param   {string} id
 * @param   {'chat'|'responses'|'assistants'|'batch'|'fine_tuning'|'embeddings'} op
 * @returns {string | undefined}
 */
function endpointFor(id, op) {
  const meta = getMeta(id);
  return meta?.endpoints?.[op];
}

/**
 * Return any `supportedParams` we do not yet provide first-class widgets for.
 * Used by the configuration UI to decide whether to show the “Advanced JSON”
 * textarea.
 *
 * @param   {ModelMeta} meta
 * @returns {string[]}  unknown parameter keys
 */
function unknownParams(meta) {
  const KNOWN = new Set([
    /* chat-ish ----------------------------------------------------------- */
    'temperature',
    'top_p',
    'max_output_tokens',
    'max_tokens',
    'n',
    'stop',
    'tools',
    'store',
    /* embedding ---------------------------------------------------------- */
    'dimensions',
    'encoding_format',
    'user',
    /* responses ---------------------------------------------------------- */
    'reasoning.effort',
    'reasoning.summary',
  ]);

  return (meta.supportedParams || []).filter((p) => !KNOWN.has(p));
}

/* -------------------------------------------------------------------------- */
/* Module exports                                                             */
/* -------------------------------------------------------------------------- */

module.exports = {
  listModels,
  getMeta,
  listByCategory,
  endpointFor,
  unknownParams,
};