/**
 * src/openaiRegistry.js
 *
 * Centralised read-only registry for OpenAI models.
 * -------------------------------------------------
 *  • Loads models-openai.json once per process.
 *  • Exposes helpers for model look-ups, listings and endpoint discovery.
 *
 * Purpose:
 *   All future OpenAI-specific code (configuration workflows, request
 *   builders, validation, etc.) must consult this registry instead of
 *   reaching for models-openai.json directly.  This guarantees a single
 *   source-of-truth and avoids duplicated parsing logic.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Created:  29 Apr 2025
 *
 * History:
 *   0.1.0  29 Apr 2025  Initial implementation (registry helpers + caching)
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const fs = require('fs');
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
 * @throws {Error} if the JSON file is missing or malformed.
 */
function loadAll() {
  if (_cached) return _cached;

  const jsonPath = path.join(__dirname, '..', 'models-openai.json');
  /** @type {{models: ModelMeta[]}} */
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  if (!Array.isArray(data.models)) {
    throw new Error('models-openai.json: expected top-level "models" array.');
  }

  // Freeze so callers cannot mutate the cache.
  _cached = Object.freeze(
    data.models
      // Defensive copy + freeze each meta object
      .map((m) => Object.freeze({ ...m })),
  );

  return _cached;
}

/* -------------------------------------------------------------------------- */
/* Public helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Return an alphabetically sorted list of model IDs.
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
 * @param {string} id
 * @returns {ModelMeta | undefined}
 */
function getMeta(id) {
  return loadAll().find((m) => m.id === id);
}

/**
 * List every model whose `category` field matches the supplied value.
 *
 * @param {string} category – e.g. "chat", "embedding"
 * @returns {ModelMeta[]}
 */
function listByCategory(category) {
  return loadAll().filter((m) => m.category === category);
}

/**
 * Convenience: retrieve the relative endpoint path for an operation.
 * Falls back to undefined if the model does not expose that endpoint.
 *
 * @param {string} id
 * @param {'chat'|'responses'|'assistants'|'batch'|'fine_tuning'|'embeddings'} op
 * @returns {string | undefined}
 */
function endpointFor(id, op) {
  const meta = getMeta(id);
  return meta?.endpoints?.[op];
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = {
  listModels,
  getMeta,
  listByCategory,
  endpointFor,
};