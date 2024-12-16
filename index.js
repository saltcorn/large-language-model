const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const db = require("@saltcorn/data/db");
const { getCompletion, getEmbedding } = require("./generate");
const { OPENAI_MODELS } = require("./constants.js");
const { eval_expression } = require("@saltcorn/data/models/expression");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "API key",
        form: async (context) => {
          const isRoot = db.getTenantSchema() === db.connectObj.default_schema;
          return new Form({
            fields: [
              {
                name: "backend",
                label: "Inference backend",
                type: "String",
                required: true,
                attributes: {
                  options: [
                    "OpenAI",
                    "OpenAI-compatible API",
                    "Local Ollama",
                    ...(isRoot ? ["Local llama.cpp"] : []),
                  ],
                },
              },
              {
                name: "api_key",
                label: "API key",
                sublabel: "From your OpenAI account",
                type: "String",
                required: true,
                showIf: { backend: "OpenAI" },
              },
              {
                name: "llama_dir",
                label: "llama.cpp directory",
                type: "String",
                required: true,
                showIf: { backend: "Local llama.cpp" },
              },
              {
                name: "model_path",
                label: "Model path",
                type: "String",
                required: true,
                showIf: { backend: "Local llama.cpp" },
              },
              {
                name: "model",
                label: "Model", //gpt-3.5-turbo
                type: "String",
                required: true,
                showIf: { backend: "OpenAI" },
                attributes: {
                  options: OPENAI_MODELS,
                },
              },
              {
                name: "embed_model",
                label: "Embedding model", //gpt-3.5-turbo
                type: "String",
                required: true,
                showIf: { backend: "OpenAI" },
                attributes: {
                  options: [
                    "text-embedding-3-small",
                    "text-embedding-3-large",
                    "text-embedding-ada-002",
                  ],
                },
              },
              {
                name: "bearer_auth",
                label: "Bearer Auth",
                sublabel: "HTTP Header authorization with bearer token",
                type: "String",
                showIf: { backend: "OpenAI-compatible API" },
              },
              {
                name: "model",
                label: "Model",
                type: "String",
                showIf: { backend: ["OpenAI-compatible API", "Local Ollama"] },
              },
              {
                name: "embed_model",
                label: "Embedding model",
                type: "String",
                showIf: { backend: ["OpenAI-compatible API", "Local Ollama"] },
              },
              {
                name: "endpoint",
                label: "Chat completions endpoint",
                type: "String",
                sublabel: "Example: http://127.0.0.1:8080/v1/chat/completions",
                showIf: { backend: "OpenAI-compatible API" },
              },
              {
                name: "embed_endpoint",
                label: "Embedding endpoint",
                type: "String",
                sublabel: "Example: http://127.0.0.1:8080/v1/embeddings",
                showIf: { backend: "OpenAI-compatible API" },
              },
              {
                name: "embed_endpoint",
                label: "Embedding endpoint",
                type: "String",
                sublabel:
                  "Optional. Example: http://localhost:11434/api/embeddings",
                showIf: { backend: "Local Ollama" },
              },
            ],
          });
        },
      },
    ],
  });

const functions = (config) => {
  return {
    llm_generate: {
      run: async (prompt, opts) => {
        const result = await getCompletion(config, { prompt, ...opts });
        return result;
      },
      isAsync: true,
      description: "Generate text with GPT",
      arguments: [{ name: "prompt", type: "String" }],
    },
    llm_embedding: {
      run: async (prompt, opts) => {
        const result = await getEmbedding(config, { prompt, ...opts });
        return result;
      },
      isAsync: true,
      description: "Get vector embedding",
      arguments: [{ name: "prompt", type: "String" }],
    },
  };
};

module.exports = {
  sc_plugin_api_version: 1,
  configuration_workflow,
  functions,
  modelpatterns: require("./model.js"),
  actions: (config) => ({
    llm_function_call: require("./function-insert-action.js")(config),
    llm_generate: {
      requireRow: true,
      configFields: ({ table, mode }) => {
        const override_fields = [
          {
            name: "override_config",
            label: "Override LLM configuration",
            type: "Bool",
          },
          {
            name: "override_endpoint",
            label: "Endpoint",
            type: "String",
            showIf: { override_config: true },
          },
          {
            name: "override_model",
            label: "Model",
            type: "String",
            showIf: { override_config: true },
          },
          {
            name: "override_apikey",
            label: "API key",
            type: "String",
            showIf: { override_config: true },
          },
          {
            name: "override_bearer",
            label: "Bearer",
            type: "String",
            showIf: { override_config: true },
          },
        ];

        if (mode === "workflow") {
          return [
            {
              name: "prompt_formula",
              label: "Prompt expression",
              sublabel:
                "JavaScript expression evalutating to the text of the prompt, based on the context",
              type: "String",
              required: true,
            },
            {
              name: "answer_field",
              label: "Answer variable",
              sublabel: "Set the generated answer to this context variable",
              type: "String",
              required: true,
            },
            ...override_fields,
          ];
        }
        if (table) {
          const textFields = table.fields
            .filter((f) => f.type?.sql_name === "text")
            .map((f) => f.name);

          return [
            {
              name: "prompt_field",
              label: "Prompt field",
              sublabel: "Field with the text of the prompt",
              type: "String",
              required: true,
              attributes: { options: [...textFields, "Formula"] },
            },
            {
              name: "prompt_formula",
              label: "Prompt formula",
              type: "String",
              showIf: { prompt_field: "Formula" },
            },
            {
              name: "answer_field",
              label: "Answer field",
              sublabel: "Output field will be set to the generated answer",
              type: "String",
              required: true,
              attributes: { options: textFields },
            },
            ...override_fields,
          ];
        }
      },
      run: async ({
        row,
        table,
        user,
        mode,
        configuration: {
          prompt_field,
          prompt_formula,
          answer_field,
          override_config,
          override_endpoint,
          override_model,
          override_apikey,
          override_bearer,
        },
      }) => {
        let prompt;
        if (prompt_field === "Formula" || mode === "workflow")
          prompt = eval_expression(
            prompt_formula,
            row,
            user,
            "llm_generate prompt formula"
          );
        else prompt = row[prompt_field];
        const opts = {};
        if (override_config) {
          opts.endpoint = override_endpoint;
          opts.model = override_model;
          opts.apikey = override_apikey;
          opts.bearer = override_bearer;
        }
        const ans = await getCompletion(config, { prompt, ...opts });
        if (mode === "workflow") return { [answer_field]: ans };
        else await table.updateRow({ [answer_field]: ans }, row[table.pk_name]);
      },
    },
  }),
};
