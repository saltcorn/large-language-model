const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { getState } = require("@saltcorn/data/db/state");
const { getCompletion, getEmbedding } = require("./generate");

module.exports = {
  description: "Use LLM function call to insert rows in tables",
  configFields: async ({ table }) => {
    const tables = Table.find();
    return [
      { name: "prompt", label: "Prompt" },
      new FieldRepeat({
        name: "columns",
        fields: [
          {
            name: "table",
            label: "Table",
            type: "String",
            required: true,
            attributes: { options: table.map((t) => t.name) },
          },
          {
            name: "Fixed values",
            label: "fixed_values",
            type: "String",
            required: true,
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
