/**
 * src/llmFunctionCall/configFields.js
 *
 * Builds the configuration form used by the LLM function-call action.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const FieldRepeat = require('@saltcorn/data/models/fieldrepeat');
const Table = require('@saltcorn/data/models/table');

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Generate the array of fields displayed in the builder UI.
 *
 * @param {object} args
 * @param {import('@saltcorn/data/models/table')} args.table
 * @returns {Promise<Array<import('@saltcorn/data/models/field')>>}
 */
async function buildConfigFields({ table }) {
  const tables = await Table.find();

  return [
    {
      name: 'prompt_template',
      label: 'Prompt',
      type: 'String',
      fieldview: 'textarea',
      sublabel: `Use interpolations {{ }} to access variables in ${table.name} table.`,
    },
    {
      name: 'function_name',
      label: 'Function name',
      type: 'String',
    },
    {
      name: 'function_description',
      label: 'Function description',
      sublabel: 'Describe what you are trying to achieve in general terms',
      type: 'String',
    },
    new FieldRepeat({
      name: 'columns',
      fields: [
        {
          name: 'target_table',
          label: 'Target table',
          type: 'String',
          required: true,
          attributes: { options: tables.map((t) => t.name) },
        },
        {
          label: 'Fixed values',
          name: 'fixed_values',
          type: 'String',
          fieldview: 'textarea',
        },
        {
          name: 'cardinality',
          label: 'Cardinality',
          type: 'String',
          required: true,
          attributes: {
            options: ['One', 'Zero to many'],
          },
        },
      ],
    }),
  ];
}

module.exports = { buildConfigFields };