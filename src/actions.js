/**
 * src/actions.js
 *
 * Saltcorn “actions” – operations users can attach to events
 * such as ‘Row saved’, ‘Clicked button’, &c.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  28 Apr 2025
 * Refactor: 28 Apr 2025 (modularised LLM function-call row insert action)
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const { getCompletion } = require('./generation');
const { eval_expression } = require('@saltcorn/data/models/expression');
const { interpolate } = require('@saltcorn/data/utils');
const { FieldRepeat } = require('@saltcorn/data/models/fieldrepeat');
const Field = require('@saltcorn/data/models/field');
const Table = require('@saltcorn/data/models/table');

/* External action for function-calling row insertion */
const buildFunctionInsertAction = require('./llmFunctionCall');

/* -------------------------------------------------------------------------- */
/* Helper functions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Build the “override config” selector field if alternative
 * configurations exist.
 *
 * @param {import('./types').PluginConfig} cfg
 * @returns {import('@saltcorn/data/models/field')[]}
 */
function overrideConfigFields(cfg) {
  const alternatives =
    cfg.backend === 'OpenAI-compatible API'
      ? (cfg.altconfigs || []).filter((c) => c?.name)
      : [];
  if (alternatives.length === 0) return [];

  return [
    {
      name: 'override_config',
      label: 'Alternative LLM configuration',
      type: 'String',
      attributes: { options: alternatives.map((c) => c.name) },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Action-builder                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Build the plug-in’s action set.
 *
 * @param {import('./types').PluginConfig} config
 * @returns {import('@saltcorn/types').SCPluginActionMap}
 */
function buildActions(config) {
  return {
    /* -------------------------------------------------------------------- */
    /* 1.  Function-calling row inserts                                     */
    /* -------------------------------------------------------------------- */
    llm_function_call: buildFunctionInsertAction(config),

    /* -------------------------------------------------------------------- */
    /* 2.  Prompt-driven text generation                                    */
    /* -------------------------------------------------------------------- */
    llm_generate: {
      description: 'Generate text with AI based on a text prompt',
      requireRow: true,

      /**
       * @param {object}            args
       * @param {import('@saltcorn/data/models/table')} args.table
       * @param {'workflow'|undefined} args.mode
       * @returns {Promise<Field[]>}
       */
      configFields: ({ table, mode }) => {
        const extra = overrideConfigFields(config);

        if (mode === 'workflow') {
          return [
            {
              name: 'prompt_template',
              label: 'Prompt',
              sublabel:
                'Prompt text. Use interpolations {{ }} to access variables in the context',
              type: 'String',
              fieldview: 'textarea',
              required: true,
            },
            {
              name: 'answer_field',
              label: 'Answer variable',
              sublabel: 'Set the generated answer to this context variable',
              type: 'String',
              required: true,
            },
            {
              name: 'chat_history_field',
              label: 'Chat history variable',
              sublabel:
                'Use this context variable to store the chat history for subsequent prompts',
              type: 'String',
            },
            ...extra,
          ];
        }

        /* ---------------- Table mode ----------------------------------- */
        const textFields = table.fields
          .filter((f) => f.type?.sql_name === 'text')
          .map((f) => f.name);

        return [
          {
            name: 'prompt_field',
            label: 'Prompt field',
            sublabel: 'Field with the text of the prompt',
            type: 'String',
            required: true,
            attributes: { options: [...textFields, 'Formula'] },
          },
          {
            name: 'prompt_formula',
            label: 'Prompt formula',
            type: 'String',
            showIf: { prompt_field: 'Formula' },
          },
          {
            name: 'answer_field',
            label: 'Answer field',
            sublabel: 'Output field will be set to the generated answer',
            type: 'String',
            required: true,
            attributes: { options: textFields },
          },
          ...extra,
        ];
      },

      /**
       * @param {import('@saltcorn/types').SCActionRunArguments} opts
       * @returns {Promise<object|void>}
       */
      run: async ({
        row,
        table,
        user,
        mode,
        configuration: {
          prompt_field: promptField,
          prompt_formula: promptFormula,
          prompt_template: promptTemplate,
          answer_field: answerField,
          override_config: overrideConfigName,
          chat_history_field: chatHistoryField,
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
        /** @type {object} */
        const opts = {};
        if (overrideConfigName) {
          const altcfg = config.altconfigs.find((c) => c.name === overrideConfigName);
          Object.assign(opts, {
            endpoint: altcfg.endpoint,
            model: altcfg.model,
            api_key: altcfg.api_key,
            bearer: altcfg.bearer,
          });
        }

        /* ---------------- Historic chat context ------------------------ */
        /** @type {object[]} */
        let history = [];
        if (chatHistoryField && row[chatHistoryField]) history = row[chatHistoryField];

        /* ---------------- Call the LLM -------------------------------- */
        const answer = await getCompletion(config, {
          prompt,
          chat: history,
          ...opts,
        });

        /* ---------------- Write back ----------------------------------- */
        const update = { [answerField]: answer };
        if (chatHistoryField) {
          update[chatHistoryField] = [
            ...history,
            { role: 'user', content: prompt },
            { role: 'assistant', content: answer },
          ];
        }

        if (mode === 'workflow') return update;
        await table.updateRow(update, row[table.pk_name]);
      },
    },

    /* -------------------------------------------------------------------- */
    /* 3.  JSON-structured generation                                      */
    /* -------------------------------------------------------------------- */
    // The JSON generation action contains a large amount of logic identical
    // to the original file.  For brevity and maintainability, we re-export
    // the original implementation without modification.  A future refactor
    // will split it similarly to `llm_generate`.
    llm_generate_json: require('../index.js').actions(config).llm_generate_json,
  };
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = buildActions;