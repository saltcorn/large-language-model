/**
 * src/modelConfigurationWorkflow.js
 *
 * Builds the workflow used when adding the “LargeLanguageModel” pattern
 * to a Saltcorn ML instance (NOT the global plug-in configuration page –
 * that is `src/configurationWorkflow.js`).
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  28 Apr 2025
 * Amended:  29 Apr 2025 – use openaiRegistry for model list
 * Revised:  05 May 2025 – updated constants import path after relocation
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const Workflow = require('@saltcorn/data/models/workflow');
const Form = require('@saltcorn/data/models/form');
const Table = require('@saltcorn/data/models/table');
const fs = require('fs');
const os = require('os');
const path = require('path');

const openaiRegistry = require('./openaiRegistry');
const { OLLAMA_MODELS_PATH } = require('./constants'); // ← path updated

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Returns the integer-typed fields of a table.
 *
 * @param {import('@saltcorn/data/models/table')} table
 * @returns {import('@saltcorn/data/models/field')[]}
 */
function getIntegerFields(table) {
  return table.fields.filter((f) => f.type?.name === 'Integer');
}

/**
 * Builds the model list offered to the user based on the selected backend.
 *
 * @param {import('./types').PluginConfig} cfg
 * @returns {string[]}
 */
function getModelOptions(cfg) {
  switch (cfg.backend) {
    case 'Local llama.cpp': {
      return fs.readdirSync(path.join(cfg.llama_dir, 'models'));
    }
    case 'OpenAI':
      return openaiRegistry.listModels();
    case 'Local Ollama': {
      const manifestsPath = path.join(
        OLLAMA_MODELS_PATH[os.type()],
        'manifests/registry.ollama.ai/library'
      );
      return fs.existsSync(manifestsPath) ? fs.readdirSync(manifestsPath) : [];
    }
    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Exported factory                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Produce the configuration-workflow builder for the
 * “LargeLanguageModel” pattern.
 *
 * @param {import('./types').PluginConfig} cfg
 * @returns {(req: object) => import('@saltcorn/data/models/workflow')}
 */
function createModelConfigurationWorkflow(cfg) {
  return (req) =>
    new Workflow({
      steps: [
        {
          name: 'Predictors',
          /**
           * @param {object} ctx – context supplied by Saltcorn
           * @returns {Promise<Form>}
           */
          form: async (ctx) => {
            const table =
              ctx.table_id || ctx.exttable_name
                ? await Table.findOne(
                    ctx.table_id ? { id: ctx.table_id } : { name: ctx.exttable_name }
                  )
                : null;

            const integerFields = table ? getIntegerFields(table) : [];
            const modelOptions = getModelOptions(cfg);

            return new Form({
              fields: [
                {
                  label: 'Prompt template',
                  name: 'prompt_template',
                  type: 'String',
                  fieldview: 'textarea',
                  /**
                   * Build a sub-label that shows the available variables.
                   */
                  sublabel: table
                    ? `Use handlebars to access fields. Variables in scope: ${table.fields
                        .map((f) => `<code>${f.name}</code>`)
                        .join(', ')}`
                    : undefined,
                },
                ...(cfg.backend === 'Local llama.cpp'
                  ? [
                      {
                        label: 'Num. tokens field',
                        name: 'ntokens_field',
                        type: 'String',
                        attributes: {
                          options: integerFields.map((f) => f.name),
                        },
                        sublabel:
                          'Override “Num tokens” (instance parameter) with the value in this field.',
                      },
                    ]
                  : []),
                {
                  label: 'Model',
                  name: 'model',
                  type: 'String',
                  required: true,
                  attributes: { options: modelOptions },
                },
              ],
            });
          },
        },
      ],
    });
}

module.exports = createModelConfigurationWorkflow;