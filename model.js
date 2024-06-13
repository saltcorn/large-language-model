const { div } = require("@saltcorn/markup/tags");

const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");

const util = require("util");
const path = require("path");
const os = require("os");
const fs = require("fs");

const _ = require("underscore");

const { getCompletion } = require("./generate");
const { OLLAMA_MODELS_PATH } = require("./constants");

const configuration_workflow = (config) => (req) =>
  new Workflow({
    steps: [
      {
        name: "Predictors",
        form: async (context) => {
          const table = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          //console.log(context);
          const int_field_options = table.fields.filter(
            (f) => f.type?.name === "Integer"
          );
          let models = [];
          if (config.backend === "Local llama.cpp") {
            models = fs.readdirSync(path.join(config.llama_dir, "models"));
          } else if (config.backend === "OpenAI") {
            models = OPENAI_MODELS;
          } else if (config.backend === "Local Ollama") {
            models = fs.readdirSync(path.join(OLLAMA_MODELS_PATH[os.type()], "manifests/registry.ollama.ai/library"));
          }
          return new Form({
            fields: [
              {
                label: "Prompt template",
                name: "prompt_template",
                type: "String",
                fieldview: "textarea",
                sublabel: div(
                  "Use handlebars to access fields. Example: <code>My name is {{name}}. How are you?</code>. Variables in scope: " +
                    table.fields.map((f) => `<code>${f.name}</code>`).join(", ")
                ),
              },
              ...(config.backend === "Local llama.cpp"
                ? [
                    {
                      label: "Num. tokens field",
                      name: "ntokens_field",
                      type: "String",
                      attributes: {
                        options: int_field_options.map((f) => f.name),
                      },
                      sublabel:
                        "Override number of tokens set in instance parameters with value in this field, if chosen",
                    },
                  ]
                : []),
              {
                label: "Model",
                name: "model",
                type: "String",
                required: true,
                attributes: { options: models },
              },
            ],
          });
        },
      },
    ],
  });

const modelpatterns = (config) => ({
  LargeLanguageModel: {
    prediction_outputs: ({ configuration }) => [
      { name: "output", type: "String" },
      { name: "prompt", type: "String" },
    ],
    configuration_workflow: configuration_workflow(config),
    hyperparameter_fields: ({ table, configuration }) => [
      ...(config.backend === "Local llama.cpp"
        ? [
            {
              name: "ntokens",
              label: "Num tokens",
              type: "Integer",
              attributes: { min: 1 },
              required: true,
              default: 128,
              sublabel: "Can be overridden by number of tokens field, if set",
            },
            {
              name: "repeat_penalty",
              label: "Repeat penalty",
              type: "Float",
              attributes: { min: 0, decimal_places: 1 },
              default: 1.1,
            },
          ]
        : []),
      {
        name: "temp",
        label: "Temperature",
        type: "Float",
        attributes: { min: 0, max: 1, decimal_places: 1 },
        default: 0.8,
      },
    ],
    predict: async ({
      id, //instance id
      model: {
        configuration: { prompt_template, ntokens_field, model },
        table_id,
      },
      hyperparameters,
      fit_object,
      rows,
    }) => {
      const results = [];
      const template = _.template(prompt_template || "", {
        evaluate: /\{\{#(.+?)\}\}/g,
        interpolate: /\{\{([^#].+?)\}\}/g,
      });
      const mdlConfig = { ...config };
      if (hyperparameters.temp) mdlConfig.temperature = hyperparameters.temp;
      const opts = { ...hyperparameters };
      if (model) opts.model = model;
      for (const row of rows) {
        const prompt = template(row);

        const output = getCompletion(mdlConfig, { ...opts, prompt });

        results.push({ output, prompt });
      }
      return results;
    },
  },
});

module.exports = modelpatterns;
