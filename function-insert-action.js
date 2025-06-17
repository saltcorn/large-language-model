const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const { getState } = require("@saltcorn/data/db/state");
const { interpolate } = require("@saltcorn/data/utils");
const { getCompletion, getEmbedding } = require("./generate");
const { eval_expression } = require("@saltcorn/data/models/expression");

const noSpaces = (s) => s.replaceAll(" ", "");
module.exports = (config) => ({
  description: "Use LLM function call to insert rows in tables",
  //requireRow: true,
  disableInList: true,
  disableInBuilder: true,
  configFields: async ({ table }) => {
    const tables = await Table.find();
    return [
      {
        name: "prompt_template",
        label: "Prompt",
        type: "String",
        fieldview: "textarea",
        sublabel: table
          ? `Use interpolations {{ }} to access variables in ${table.name} table.`
          : undefined,
      },
      {
        name: "function_name",
        label: "Function name",
        type: "String",
      },
      {
        name: "function_description",
        label: "Function description",
        sublabel: "Describe what you are trying to achieve in general terms",
        type: "String",
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
            sublabel: "How many rows to generate",
            required: true,
            attributes: {
              options: ["One", /*"Zero or one",*/ "Zero to many"],
            },
          },
        ],
      }),
    ];
  },
  run: async ({
    row,
    table,
    configuration: {
      prompt_template,
      columns,
      function_description,
      function_name,
    },
    user,
  }) => {
    const prompt = interpolate(prompt_template, row, user);
    let args = {};
    const json_type = (ty) => {
      if (ty?.name === "Date") return "string";
      //console.log("getting type of ", ty);

      if (ty?.js_type) return ty?.js_type;
    };

    for (const col of columns) {
      const target_table = Table.findOne({ name: col.target_table });
      const tableArgs = {};
      const fixed = eval_expression(
        col.fixed_values,
        row,
        user,
        "llm_function_call fixed values"
      );
      for (const field of target_table.fields) {
        if (field.primary_key) continue;
        if (typeof fixed[field.name] !== "undefined") continue;
        tableArgs[field.name] = {
          type: json_type(field.type),
          description: field.description || field.label,
        };
      }
      const argObj = { type: "object", properties: tableArgs };
      args[noSpaces(target_table.name)] =
        col.cardinality == "One" ? argObj : { type: "array", items: argObj };
    }
    if (columns.length === 1) {
      //args = args[Object]
    }
    const expert_function = {
      type: "function",
      function: {
        name: function_name,
        description: function_description,
        parameters: {
          type: "object",
          properties: args,
        },
      },
    };

    const toolargs = {
      tools: [expert_function],
      tool_choice: { type: "function", function: { name: function_name } },
    };
    //console.log(JSON.stringify(expert_function, null, 2));
    const compl = await getCompletion(config, { prompt, ...toolargs });
    getState().log(6, `llm_function_call completion: ${JSON.stringify(compl)}`);
    const response = JSON.parse(compl.tool_calls[0].function.arguments);
    //console.log("response: ", JSON.stringify(response, null, 2));
    const retval = {};
    for (const col of columns) {
      const target_table = Table.findOne({ name: col.target_table });
      const fixed = eval_expression(
        col.fixed_values || {},
        row,
        user,
        "llm_function_call fixed values"
      );

      if (col.cardinality == "One") {
        const row = {
          ...(response[noSpaces(target_table.name)] || {}),
          ...fixed,
        };
        retval[noSpaces(target_table.name)] = row;
        await target_table.insertRow(row, user);
      } else {
        retval[noSpaces(target_table.name)] = [];
        for (const resp of response[noSpaces(target_table.name)] || []) {
          const row = { ...resp, ...fixed };
          retval[noSpaces(target_table.name)].push(row);
          await target_table.insertRow(row, user);
        }
      }
    }
    return retval;
  },
});
