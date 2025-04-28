/**
 * src/largeLanguageModelPattern.js
 *
 * Defines the “LargeLanguageModel” pattern used by Saltcorn’s ML module.
 * The pattern wraps any chat-style LLM supported by the plug-in and
 * exposes it as a trainer-less predictor (prompt → output).
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const _ = require('underscore');

const { getCompletion } = require('../generate');
const createModelConfigurationWorkflow = require('./modelConfigurationWorkflow');

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Regular-expressions for Underscore’s template engine.
 * They match the original implementation’s Mustache-style syntax.
 */
const TEMPLATE_SETTINGS = {
  evaluate: /\{\{#(.+?)\}\}/g,
  interpolate: /\{\{([^#].+?)\}\}/g,
};

/* -------------------------------------------------------------------------- */
/* Pattern builder                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Build the pattern definition for the given plug-in configuration.
 *
 * @param {import('./types').PluginConfig} cfg
 * @returns {import('@saltcorn/types').ModelPattern}
 */
function buildLargeLanguageModelPattern(cfg) {
  /* -------------------------------------------------------------------- */
  /* 1.  Hyper-parameter field definitions                                */
  /* -------------------------------------------------------------------- */

  /**
   * Fields exposed to the user when adding an ML instance.
   *
   * @param {object} args
   * @param {import('@saltcorn/data/models/table')} args.table
   * @returns {import('@saltcorn/data/models/field')[]}
   */
  function hyperparameterFields({ table }) {
    const base = [
      {
        name: 'temp',
        label: 'Temperature',
        type: 'Float',
        attributes: { min: 0, max: 1, decimal_places: 1 },
        default: 0.8,
      },
    ];

    if (cfg.backend === 'Local llama.cpp') {
      base.unshift(
        {
          name: 'repeat_penalty',
          label: 'Repeat penalty',
          type: 'Float',
          attributes: { min: 0, decimal_places: 1 },
          default: 1.1,
        },
        {
          name: 'ntokens',
          label: 'Num tokens',
          type: 'Integer',
          attributes: { min: 1 },
          required: true,
          default: 128,
          sublabel:
            'Can be overridden by “Num tokens field” (configured in the instance).',
        }
      );
    }

    return base;
  }

  /* -------------------------------------------------------------------- */
  /* 2.  Prediction logic                                                 */
  /* -------------------------------------------------------------------- */

  /**
   * Run inference for every supplied row.
   *
   * @param {object} args
   * @param {number} args.id – Instance ID (unused)
   * @param {object} args.model
   * @param {object} args.model.configuration
   * @param {string} args.model.configuration.prompt_template
   * @param {string=} args.model.configuration.ntokens_field
   * @param {string=} args.model.configuration.model
   * @param {number} args.model.table_id – Owning table ID (unused)
   * @param {Record<string, number|string>} args.hyperparameters
   * @param {unknown} args.fit_object – Unused (no training phase)
   * @param {object[]} args.rows – Rows to run prediction against
   * @returns {Promise<Array<{output: string|object, prompt: string}>>}
   */
  async function predict({
    model: {
      configuration: { prompt_template: promptTemplate, model: overrideModel },
    },
    hyperparameters,
    rows,
  }) {
    const template = _.template(promptTemplate || '', TEMPLATE_SETTINGS);

    /* Build an execution config derived from the plug-in config but
       allowing the user to override temperature & model. */
    const execCfg = { ...cfg };
    if (typeof hyperparameters.temp === 'number') {
      execCfg.temperature = hyperparameters.temp;
    }

    /** Additional options forwarded to `getCompletion` */
    const completionOpts = { ...hyperparameters };
    if (overrideModel) completionOpts.model = overrideModel;

    const results = [];
    for (const row of rows) {
      const prompt = template(row);
      // eslint-disable-next-line no-await-in-loop
      const output = await getCompletion(execCfg, { ...completionOpts, prompt });
      results.push({ output, prompt });
    }

    return results;
  }

  /* -------------------------------------------------------------------- */
  /* 3.  Final pattern object                                             */
  /* -------------------------------------------------------------------- */

  return {
    prediction_outputs: () => [
      { name: 'output', type: 'String' },
      { name: 'prompt', type: 'String' },
    ],
    configuration_workflow: createModelConfigurationWorkflow(cfg),
    hyperparameter_fields: hyperparameterFields,
    predict,
  };
}

module.exports = buildLargeLanguageModelPattern;