/**
 * src/modelPatterns.js
 *
 * Entry-point aggregating all model patterns offered by the plug-in.
 * New patterns should be imported and added to the exported object from
 * here to keep `plugin.js` clean.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const buildLargeLanguageModelPattern = require('./largeLanguageModelPattern');

/* -------------------------------------------------------------------------- */
/* Exported factory                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Saltcorn expects `modelpatterns` to be a function that receives the
 * current plug-in configuration and returns an object keyed by pattern
 * name.
 *
 * @param {import('./types').PluginConfig} cfg
 * @returns {import('@saltcorn/types').SCModelPatternMap}
 */
function buildModelPatterns(cfg) {
  return {
    LargeLanguageModel: buildLargeLanguageModelPattern(cfg),
  };
}

module.exports = buildModelPatterns;