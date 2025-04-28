/**
 * src/generation/llamaCpp.js
 *
 * Local llama.cpp inference.  Embeddings are not supported.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

const util = require('util');
const { promisify } = util;
const exec = promisify(require('child_process').exec);
const db = require('@saltcorn/data/db');

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Generate text using a local llama.cpp build.
 *
 * @param {object} cfg
 * @param {string} cfg.model_path
 * @param {string} cfg.llama_dir
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {number=} opts.temperature
 * @param {number=} opts.ntokens
 * @returns {Promise<string>}
 */
async function getCompletion(cfg, opts) {
  const isRootTenant = db.getTenantSchema() === db.connectObj.default_schema;
  if (!isRootTenant) {
    throw new Error('llama.cpp inference is not permitted on sub-domain tenants.');
  }

  let hyperStr = '';
  if (opts.temperature) hyperStr += ` --temp ${opts.temperature}`;

  const nstr = opts.ntokens ? `-n ${opts.ntokens}` : '';

  const { stdout } = await exec(
    `./main -m ${cfg.model_path} -p "${opts.prompt}" ${nstr}${hyperStr}`,
    { cwd: cfg.llama_dir },
  );
  return stdout.trim();
}

module.exports = { getCompletion };