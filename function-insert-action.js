const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { getState } = require("@saltcorn/data/db/state");
const { getCompletion, getEmbedding } = require("./generate");

module.exports = {
  description: "Use LLM function call to insert rows in tables",
  requireRow: true,
  configFields: async ({ table }) => {
    const tables = await Table.find();
    return [
      {
        name: "prompt",
        label: "Prompt",
        type: "String",
        fieldview: "textarea",
        sublabel: `Use interpolations {{ }} to access variables in ${table.name} table.`,
      },
      new FieldRepeat({
        name: "columns",
        fields: [
          {
            name: "target_table",
            label: "Target table",
            type: "String",
            required: true,
            attributes: { options: tables.map((t) => t.name) },
          },
          {
            label: "Fixed values",
            name: "fixed_values",
            type: "String",
            fieldview: "textarea",
          },
          {
            name: "cardinality",
            label: "Cardinality",
            type: "String",
            required: true,
            attributes: {
              options: ["One", "Zero or one", "Zero to many"],
            },
          },
        ],
      }),
    ];
  },
  run: async ({ row, table, configuration: { prompt, columns }, user }) => {},
};
