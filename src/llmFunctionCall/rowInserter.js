/**
 * src/llmFunctionCall/rowInserter.js
 *
 * Writes the rows returned by the LLM into the configured tables.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const Table = require('@saltcorn/data/models/table');
const { eval_expression } = require('@saltcorn/data/models/expression');
const { removeSpaces } = require('./stringUtils');

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Insert the rows described in the LLM response.
 *
 * @param {Array<object>} columns           – Column configuration
 * @param {Record<string, unknown>} response – Parsed LLM response
 * @param {object} contextRow               – Row that triggered the action
 * @param {import('@saltcorn/types').SCUser} user
 * @returns {Promise<void>}
 */
async function insertRows(columns, response, contextRow, user) {
  for (const col of columns) {
    const targetTable = Table.findOne({ name: col.target_table });
    if (!targetTable) continue;

    const fixedValues = eval_expression(
      col.fixed_values,
      contextRow,
      user,
      'llm_function_call fixed values',
    );

    const key = removeSpaces(targetTable.name);

    if (col.cardinality === 'One') {
      const row = {
        ...(response[key] ?? {}),
        ...fixedValues,
      };
      await targetTable.insertRow(row, user);
    } else {
      for (const resp of /** @type {Array<object>} */ (response[key] ?? [])) {
        const row = { ...resp, ...fixedValues };
        /* eslint-disable-next-line no-await-in-loop */
        await targetTable.insertRow(row, user);
      }
    }
  }
}

module.exports = { insertRows };