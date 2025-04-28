/**
 * src/generation/oauth.js
 *
 * Google OAuth2 helpers shared by the Vertex AI backend.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

const { google } = require('googleapis');
const Plugin = require('@saltcorn/data/models/plugin');
const { getState } = require('@saltcorn/data/db/state');
const db = require('@saltcorn/data/db');

/* -------------------------------------------------------------------------- */
/* updatePluginTokenCfg                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Persist refreshed OAuth2 tokens into the plug-in configuration.
 *
 * @param {import('google-auth-library').Credentials} credentials
 * @returns {Promise<void>}
 */
async function updatePluginTokenCfg(credentials) {
  /** @type {import('@saltcorn/data/models/plugin')} */
  let plugin =
    (await Plugin.findOne({ name: 'large-language-model' })) ||
    (await Plugin.findOne({ name: '@saltcorn/large-language-model' }));

  const newConfig = { ...(plugin.configuration ?? {}), tokens: credentials };
  plugin.configuration = newConfig;
  await plugin.upsert();

  getState().processSend({
    refresh_plugin_cfg: plugin.name,
    tenant: db.getTenantSchema(),
  });
}

/* -------------------------------------------------------------------------- */
/* initOAuth2Client                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Initialise an OAuth2 client using credentials in plug-in config.
 *
 * @param {object} cfg
 * @param {string} cfg.client_id
 * @param {string} cfg.client_secret
 * @returns {Promise<import('google-auth-library').OAuth2Client>}
 */
async function initOAuth2Client(cfg) {
  const state = getState();
  const pluginCfg =
    state.plugin_cfgs['large-language-model'] ||
    state.plugin_cfgs['@saltcorn/large-language-model'];

  const baseUrl = (getState().getConfig('base_url') ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  const redirectUri = `${baseUrl}/callback`;

  const oauth2Client = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    redirectUri,
  );
  oauth2Client.setCredentials(pluginCfg.tokens);
  return oauth2Client;
}

module.exports = { initOAuth2Client, updatePluginTokenCfg };