/**
 * src/routes.js
 *
 * Express routes added by the plug-in.
 * • Google Vertex AI OAuth2 flow (existing).
 * • NEW: POST /large-language-model/openai/test
 *   – Allows admins to send an ad-hoc prompt with the current form
 *     values and see the raw model output.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 01 May 2025 – add OpenAI test route
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const { getState } = require('@saltcorn/data/db/state');
const Plugin       = require('@saltcorn/data/models/plugin');
const db           = require('@saltcorn/data/db');
const { google }   = require('googleapis');

const { getCompletion } = require('./generation');

/* -------------------------------------------------------------------------- */
/* Route builder                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Build the route list required by Saltcorn.
 *
 * @param   {import('./types').PluginConfig} config
 * @returns {import('@saltcorn/types').SCPluginRoute[]}
 */
function buildRoutes(config) {
  return [
    /* =================================================================== */
    /* 1.  Google Vertex AI – OAuth2 initiation                            */
    /* =================================================================== */
    {
      url: '/large-language-model/vertex/authorize',
      method: 'get',
      /**
       * Kick-off OAuth2 dance.
       *
       * @param {import('express').Request}  req
       * @param {import('express').Response} res
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

    /* =================================================================== */
    /* 2.  Google Vertex AI – OAuth2 callback                              */
    /* =================================================================== */
    {
      url: '/large-language-model/vertex/callback',
      method: 'get',
      /**
       * Receive OAuth2 code, exchange for tokens, persist them.
       *
       * @param {import('express').Request}  req
       * @param {import('express').Response} res
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
            req.flash('success', req.__('Authentication successful – Vertex AI ready.'));
          }
        } catch (error) {
          console.error('Vertex AI OAuth error:', error);
          req.flash('error', req.__('Error retrieving access'));
        } finally {
          res.redirect(`/plugins/configure/${encodeURIComponent(plugin.name)}`);
        }
      },
    },

    /* =================================================================== */
    /* 3.  OpenAI – quick “Test model” helper                              */
    /* =================================================================== */
    {
      url: '/large-language-model/openai/test',
      method: 'post',
      /**
       * Dry-run a prompt with the posted configuration fields.
       *
       * @param {import('express').Request}  req
       * @param {import('express').Response} res
       */
      callback: async (req, res) => {
        const role = req?.user?.role_id ?? 100;
        if (role > 1) return res.status(403).json({ ok: false, error: 'Not authorised' });

        try {
          /* Express parses urlencoded + json by default.  FormData (multipart)
             reaches us via `multer` registered by Saltcorn core, so req.body is OK. */
          /** @type {Record<string,string>} */
          const body = req.body || {};

          const prompt = body.prompt;
          if (!prompt) throw new Error('Missing prompt');

          /* Build a temporary config object – NOT persisted */
          const tmpCfg = {
            backend     : body.backend,
            api_key     : body.api_key,
            bearer_auth : body.bearer_auth,
            endpoint    : body.endpoint,
            model       : body.model,
          };

          /** @type {Record<string,unknown>} */
          const opts = {
            prompt,
            model              : body.model,
            temperature        : body.temperature ? parseFloat(body.temperature) : undefined,
            top_p              : body.top_p ? parseFloat(body.top_p) : undefined,
            max_output_tokens  : body.max_output_tokens ? parseInt(body.max_output_tokens, 10) : undefined,
            n                  : body.n ? parseInt(body.n, 10) : undefined,
            stop               : body.stop || undefined,
          };

          if (body.response_format) {
            opts.text = JSON.parse(body.response_format);
          }
          if (body.advanced_options) {
            Object.assign(opts, JSON.parse(body.advanced_options));
          }

          const result = await getCompletion(tmpCfg, opts);
          res.json({ ok: true, result });
        } catch (e) {
          res.status(400).json({ ok: false, error: e.message });
        }
      },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = buildRoutes;