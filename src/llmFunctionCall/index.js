/**
 * src/llmFunctionCall/index.js
 *
 * LLM function-call action.  Uses an LLM’s function-calling capability
 * to map structured arguments to INSERT operations on Saltcorn tables.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const { buildConfigFields } = require('./configFields');
const { buildFunctionParameters } = require('./argSchemaBuilder');
const { insertRows } = require('./rowInserter');

const { interpolate } = require('@saltcorn/data/utils');
const { getCompletion } = require('../generation');
const { getState } = require('@saltcorn/data/db/state');

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Produce the Saltcorn action definition.
 *
 * @param {import('../types').PluginConfig} cfg
 * @returns {import('@saltcorn/types').SCPluginAction}
 */
function buildFunctionInsertAction(cfg) {
  return {
    description: 'Use LLM function call to insert rows in tables',
    requireRow: true,
    disableInList: true,
    disableInBuilder: true,

    /* -------------------- Configuration UI ----------------------------- */
    /**
     * @param {object} args
     * @param {import('@saltcorn/data/models/table')} args.table
     * @returns {Promise<Array<import('@saltcorn/data/models/field')>>}
     */
    configFields: ({ table }) => buildConfigFields({ table }),

    /* --------------------------- Run ----------------------------------- */
    /**
     * @param {import('@saltcorn/types').SCActionRunArguments} params
     * @returns {Promise<object>}
     */
    run: async ({
      row,
      configuration: {
        prompt_template: promptTemplate,
        columns,
        function_description: functionDescription,
        function_name: functionName,
      },
      user,
    }) => {
      /* 1. Build prompt */
      const prompt = interpolate(promptTemplate, row, user);

      /* 2. Build function declaration */
      const parameters = buildFunctionParameters(columns, row, user);

      /** @type {object} */
      const expertFunction = {
        type: 'function',
        function: {
          name: functionName,
          description: functionDescription,
          parameters: {
            type: 'object',
            properties: parameters,
          },
        },
      };

      /* 3. Call the LLM */
      const completion = await getCompletion(cfg, {
        prompt,
        tools: [expertFunction],
        tool_choice: { type: 'function', function: { name: functionName } },
      });

      getState().log(
        6,
        `llm_function_call completion: ${JSON.stringify(completion)}`,
      );

      /* 4. Parse result */
      const response = JSON.parse(
        completion.tool_calls[0].function.arguments,
      );

      /* 5. Insert rows */
      await insertRows(columns, response, row, user);

      return {};
    },
  };
}

module.exports = buildFunctionInsertAction;