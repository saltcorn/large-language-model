/**
 * src/plugin.js
 *
 * Combines all modular pieces into the object required by
 * Saltcorn’s plug-in API.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const createConfigurationWorkflow = require('./configurationWorkflow');
const buildFunctions = require('./llmFunctions');
const buildRoutes = require('./routes');
const buildActions = require('./actions');
const buildModelPatterns = require('./modelPatterns');

/* -------------------------------------------------------------------------- */
/* Plug-in API                                                                */
/* -------------------------------------------------------------------------- */

module.exports = {
  sc_plugin_api_version: 1,

  /* Configuration screen (no instance data needed) */
  configuration_workflow: createConfigurationWorkflow(),

  /* Functions, routes, actions all depend on runtime config */
  functions: (config) => buildFunctions(config),

  routes: (config) => buildRoutes(config),

  modelpatterns: (config) => buildModelPatterns(config),

  actions: (config) => buildActions(config),
};