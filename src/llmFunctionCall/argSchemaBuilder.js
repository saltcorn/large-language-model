/**
 * src/llmFunctionCall/argSchemaBuilder.js
 *
 * Constructs the JSON schema used when declaring the function
 * signature to the LLM.
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
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Translate a Saltcorn field type into a JSON-schema type.
 *
 * @param {import('@saltcorn/types').FieldType | undefined} fieldType
 * @returns {'string'|'integer'|'number'|'boolean'|undefined}
 */
function jsonType(fieldType) {
  if (fieldType?.js_type) {
    return /** @type {'string'|'integer'|'number'|'boolean'} */ (fieldType.js_type);
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Build the “parameters” object used in the function declaration sent
 * to the LLM.
 *
 * @param {Array<object>} columns
 * @param {object} row
 * @param {import('@saltcorn/types').SCUser} user
 * @returns {Record<string, unknown>}
 */
function buildFunctionParameters(columns, row, user) {
  /** @type {Record<string, unknown>} */
  const parameters = {};

  for (const col of columns) {
    const targetTable = Table.findOne({ name: col.target_table });
    if (!targetTable) continue;

    /** @type {Record<string, unknown>} */
    const tableParams = {};

    /* Fixed values that will be merged server-side */
    const fixedValues = eval_expression(
      col.fixed_values,
      row,
      user,
      'llm_function_call fixed values',
    );

    for (const field of targetTable.fields) {
      if (field.primary_key) continue;
      if (typeof fixedValues[field.name] !== 'undefined') continue;

      tableParams[field.name] = {
        type: jsonType(field.type) ?? 'string',
        description: field.description,
      };
    }

    const argObj = { type: 'object', properties: tableParams };

    parameters[removeSpaces(targetTable.name)] =
      col.cardinality === 'One'
        ? argObj
        : { type: 'array', items: argObj };
  }

  return parameters;
}

module.exports = { buildFunctionParameters };