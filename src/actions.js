/**
 * src/actions.js
 *
 * Saltcorn “actions” – operations users can attach to events such
 * as ‘Row saved’, ‘Clicked button’, &c.
 *
 * Hardened so the plug-in can be loaded even when no configuration
 * has been saved yet (cfg === undefined).
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  10 May 2025 – defensive config handling via safeConfig()
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const { safeConfig }          = require('./utils');
const { getCompletion }       = require('./generation');
const { eval_expression }     = require('@saltcorn/data/models/expression');
const { interpolate }         = require('@saltcorn/data/utils');
const { FieldRepeat }         = require('@saltcorn/data/models/fieldrepeat');
const Field                   = require('@saltcorn/data/models/field');
const Table                   = require('@saltcorn/data/models/table');

const buildFunctionInsertAction = require('./llmFunctionCall'); // external action

/* -------------------------------------------------------------------------- */
/* Helper functions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Builds the “override config” selector field when alternative
 * configurations exist (OpenAI-compatible back-ends only).
 *
 * @param {import('./types').PluginConfig|undefined} cfg
 * @returns {import('@saltcorn/data/models/field')[]}
 */
function overrideConfigFields(cfg) {
  const backend      = cfg?.backend ?? '';
  const altconfigs   = cfg?.altconfigs ?? [];
  const alternatives =
    backend === 'OpenAI-compatible API'
      ? altconfigs.filter((c) => c?.name)
      : [];

  if (alternatives.length === 0) return [];

  return [
    {
      name      : 'override_config',
      label     : 'Alternative LLM configuration',
      type      : 'String',
      attributes: { options: alternatives.map((c) => c.name) },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Action-builder                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Build the plug-in’s action set.  All configuration reads are wrapped
 * with safeConfig so that the builder does not throw when Saltcorn loads
 * the plug-in before any settings exist.
 *
 * @param {import('./types').PluginConfig|undefined} config
 * @returns {import('@saltcorn/types').SCPluginActionMap}
 */
function buildActions(config) {
  const cfg = safeConfig(config);

  return {
    /* =================================================================== */
    /* 1.  Function-calling row inserts                                    */
    /* =================================================================== */
    llm_function_call: buildFunctionInsertAction(cfg),

    /* =================================================================== */
    /* 2.  Prompt-driven text generation                                   */
    /* =================================================================== */
    llm_generate: {
      description : 'Generate text with AI based on a text prompt',
      requireRow  : true,

      /**
       * Configuration form shown in the action builder.
       *
       * @param {object} args
       * @param {import('@saltcorn/data/models/table')} args.table
       * @param {'workflow' | undefined} args.mode
       * @returns {Promise<Field[]>}
       */
      configFields: ({ table, mode }) => {
        const extra = overrideConfigFields(cfg);

        /* ---------- advanced optional fields (shown in both modes) ------ */
        const advanced = [
          {
            name      : 'response_format',
            label     : 'Response format (JSON)',
            sublabel  :
              'Optional. Paste a JSON object to request a non-text output ' +
              'format (e.g. { "format": { "type": "json_schema" } }).',
            type      : 'String',
            fieldview : 'textarea',
          },
        ];

        /* ---------------- Workflow-mode UI ----------------------------- */
        if (mode === 'workflow') {
          return [
            {
              name      : 'prompt_template',
              label     : 'Prompt',
              sublabel  :
                'Prompt text. Use interpolations {{ }} to access variables ' +
                'in the context.',
              type      : 'String',
              fieldview : 'textarea',
              required  : true,
            },
            {
              name     : 'answer_field',
              label    : 'Answer variable',
              sublabel : 'Set the generated answer to this context variable.',
              type     : 'String',
              required : true,
            },
            {
              name     : 'chat_history_field',
              label    : 'Chat history variable',
              sublabel :
                'Use this context variable to store the chat history for ' +
                'subsequent prompts.',
              type: 'String',
            },
            ...advanced,
            ...extra,
          ];
        }

        /* ---------------- Table-mode UI -------------------------------- */
        const textFields =
          table?.fields
            .filter((f) => f.type?.sql_name === 'text')
            .map((f) => f.name) ?? [];

        return [
          {
            name      : 'prompt_field',
            label     : 'Prompt field',
            sublabel  : 'Field containing the text of the prompt.',
            type      : 'String',
            required  : true,
            attributes: { options: [...textFields, 'Formula'] },
          },
          {
            name   : 'prompt_formula',
            label  : 'Prompt formula',
            type   : 'String',
            showIf : { prompt_field: 'Formula' },
          },
          {
            name      : 'answer_field',
            label     : 'Answer field',
            sublabel  : 'Output field will be set to the generated answer.',
            type      : 'String',
            required  : true,
            attributes: { options: textFields },
          },
          ...advanced,
          ...extra,
        ];
      },

      /**
       * Execute the action.
       *
       * @param {import('@saltcorn/types').SCActionRunArguments} args
       * @returns {Promise<object|void>}
       */
      run: async ({
        row,
        table,
        user,
        mode,
        configuration: {
          prompt_field      : promptField,
          prompt_formula    : promptFormula,
          prompt_template   : promptTemplate,
          answer_field      : answerField,
          override_config   : overrideConfigName,
          chat_history_field: chatHistoryField,
          response_format   : responseFormatRaw,
        },
      }) => {
        /* ---------------- Build the prompt ----------------------------- */
        let prompt;
        if (mode === 'workflow') {
          prompt = interpolate(promptTemplate, row, user);
        } else if (promptField === 'Formula') {
          prompt = eval_expression(
            promptFormula,
            row,
            user,
            'llm_generate prompt formula',
          );
        } else {
          prompt = row[promptField];
        }

        /* ---------------- Config overrides ----------------------------- */
        /** @type {Record<string, unknown>} */
        const opts = {};
        if (overrideConfigName && Array.isArray(cfg.altconfigs)) {
          const altcfg = cfg.altconfigs.find((c) => c.name === overrideConfigName);
          if (altcfg) {
            Object.assign(opts, {
              endpoint: altcfg.endpoint,
              model   : altcfg.model,
              api_key : altcfg.api_key,
              bearer  : altcfg.bearer,
            });
          }
        }

        /* ---------------- Historic chat context ------------------------ */
        /** @type {Array<object>} */
        let history = [];
        if (chatHistoryField && row[chatHistoryField]) history = row[chatHistoryField];

        /* ---------------- Response format override --------------------- */
        if (responseFormatRaw) {
          try {
            const textObj = JSON.parse(responseFormatRaw);
            if (typeof textObj !== 'object' || !textObj.format) {
              throw new Error('Format must be an object that contains a "format" key.');
            }
            opts.text = textObj; // openaiV2 will pick this up
          } catch (e) {
            throw new Error(`Invalid JSON in “Response format”: ${e.message}`);
          }
        }

        /* ---------------- Call the LLM -------------------------------- */
        const answer = await getCompletion(cfg, {
          prompt,
          chat: history,
          ...opts,
        });

        /* ---------------- Write back ----------------------------------- */
        const update = { [answerField]: answer };
        if (chatHistoryField) {
          update[chatHistoryField] = [
            ...history,
            { role: 'user',      content: prompt  },
            { role: 'assistant', content: answer  },
          ];
        }

        if (mode === 'workflow') return update;
        await table.updateRow(update, row[table.pk_name]);
      },
    },

    /* =================================================================== */
    /* 3.  JSON-structured generation                                     */
    /* =================================================================== */
    // Re-export the original implementation untouched to keep behaviour
    // identical; it already guards against missing settings internally.
    llm_generate_json: require('../index.js').actions(cfg).llm_generate_json,
  };
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = buildActions;