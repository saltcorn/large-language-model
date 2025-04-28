/**
 * src/constants.js
 *
 * Centralised constants for the Saltcorn “Large-Language-Model” plug-in.
 * --------------------------------------------------------------------------
 *  • Only the Ollama model-cache paths remain. All OpenAI-specific helpers
 *    were removed because the plug-in now relies on `openaiRegistry.js`.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Created: 28 Apr 2025
 * Updated: 05 May 2025 – stripped OpenAI code; moved into src/
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Ollama model cache locations                                               */
/* -------------------------------------------------------------------------- */

/* eslint-disable camelcase */
const OLLAMA_MODELS_PATH = {
  Darwin:     `${process.env.HOME}/.ollama/models`,
  Linux:      '/usr/share/ollama/.ollama/models',
  Windows_NT: 'C:\\Users\\%username%\\.ollama\\models.',
};
/* eslint-enable camelcase */

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = {
  OLLAMA_MODELS_PATH,
};