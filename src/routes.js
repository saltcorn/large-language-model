/**
 * src/routes.js
 *
 * Express routes added by the plug-in.  Currently provides
 * OAuth2 authorisation flow for Google Vertex AI.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const { getState } = require('@saltcorn/data/db/state');
const Plugin = require('@saltcorn/data/models/plugin');
const db = require('@saltcorn/data/db');
const { google } = require('googleapis');

/* -------------------------------------------------------------------------- */
/* Type-definitions (JSDoc)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Build the plug-in’s Express routes.
 *
 * @param {import('./types').PluginConfig} config
 * @returns {import('@saltcorn/types').SCPluginRoute[]}
 */
function buildRoutes(config) {
  return [
    /* -------------------------------------------------------------------- */
    /* 1.  OAuth2 Initiation                                                */
    /* -------------------------------------------------------------------- */
    {
      url: '/large-language-model/vertex/authorize',
      method: 'get',
      /**
       * @param {import('express').Request} req
       * @param {import('express').Response} res
       * @returns {Promise<void>}
       */
      callback: async (req, res) => {
        const role = req?.user?.role_id ?? 100;
        if (role > 1) {
          req.flash('error', req.__('Not authorised'));
          return res.redirect('/');
        }

        const { client_id: clientId, client_secret: clientSecret } = config;
        const baseUrl = (getState().getConfig('base_url') || 'http://localhost:3000').replace(
          /\/$/,
          '',
        );
        const redirectUri = `${baseUrl}/large-language-model/vertex/callback`;

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: 'https://www.googleapis.com/auth/cloud-platform',
          prompt: 'consent',
        });

        res.redirect(authUrl);
      },
    },

    /* -------------------------------------------------------------------- */
    /* 2.  OAuth2 Callback                                                  */
    /* -------------------------------------------------------------------- */
    {
      url: '/large-language-model/vertex/callback',
      method: 'get',
      /**
       * @param {import('express').Request} req
       * @param {import('express').Response} res
       * @returns {Promise<void>}
       */
      callback: async (req, res) => {
        const role = req?.user?.role_id ?? 100;
        if (role > 1) {
          req.flash('error', req.__('Not authorised'));
          return res.redirect('/');
        }

        const { client_id: clientId, client_secret: clientSecret } = config;
        const baseUrl = (getState().getConfig('base_url') || 'http://localhost:3000').replace(
          /\/$/,
          '',
        );
        const redirectUri = `${baseUrl}/large-language-model/vertex/callback`;
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

        /** @type {Plugin|null} */
        let plugin =
          (await Plugin.findOne({ name: 'large-language-model' })) ||
          (await Plugin.findOne({ name: '@saltcorn/large-language-model' }));

        try {
          const code = req.query.code;
          if (!code) throw new Error('Missing code in query string.');
          const { tokens } = await oauth2Client.getToken(code);
          if (!tokens.refresh_token) {
            req.flash(
              'warning',
              req.__(
                "No refresh token received. Please revoke the plug-in's access and try again.",
              ),
            );
          } else {
            plugin.configuration = { ...(plugin.configuration || {}), tokens };
            await plugin.upsert();
            getState().processSend({
              refresh_plugin_cfg: plugin.name,
              tenant: db.getTenantSchema(),
            });
            req.flash('success', req.__('Authentication successful!  You can now use Vertex AI.'));
          }
        } catch (error) {
          console.error('Error retrieving access token:', error);
          req.flash('error', req.__('Error retrieving access'));
        } finally {
          res.redirect(`/plugins/configure/${encodeURIComponent(plugin.name)}`);
        }
      },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = buildRoutes;