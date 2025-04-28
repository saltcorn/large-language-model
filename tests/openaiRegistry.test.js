/**
 * tests/openaiRegistry.test.js
 *
 * Lightweight sanity checks for the OpenAI registry helper.
 * These tests can be run with:
 *
 *     node tests/openaiRegistry.test.js
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Created:  29 Apr 2025
 */

'use strict';

/* eslint-disable no-console */

const assert = require('assert').strict;
const registry = require('../src/openaiRegistry');

/* -------------------------------------------------------------------------- */
/* 1. listModels() returns an array with >0 elements and alphabetical order   */
/* -------------------------------------------------------------------------- */

const models = registry.listModels();
assert(Array.isArray(models), 'listModels() must return an array');
assert(models.length > 0, 'listModels() expected at least one model');
const sorted = [...models].sort((a, b) => a.localeCompare(b));
assert.deepEqual(models, sorted, 'listModels() must be alphabetical');

/* -------------------------------------------------------------------------- */
/* 2. getMeta() returns the full object and is frozen                         */
/* -------------------------------------------------------------------------- */

const meta = registry.getMeta(models[0]);
assert(meta, 'getMeta() should return metadata for valid ID');
assert(meta.id === models[0], 'Returned meta.id should match the lookup key');
assert(Object.isFrozen(meta), 'Metadata objects must be frozen');

/* -------------------------------------------------------------------------- */
/* 3. endpointFor() reflects the JSON data                                    */
/* -------------------------------------------------------------------------- */

if (meta.endpoints?.chat) {
  const ep = registry.endpointFor(meta.id, 'chat');
  assert(ep === meta.endpoints.chat, 'endpointFor() mismatch');
}

/* -------------------------------------------------------------------------- */
/* 4. listByCategory() returns only requested category                        */
/* -------------------------------------------------------------------------- */

const chatModels = registry.listByCategory('chat');
assert(
  chatModels.every((m) => m.category === 'chat'),
  'listByCategory() must filter by category',
);

console.log('✅  openaiRegistry: all basic tests passed.');