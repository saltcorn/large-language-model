const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const db = require("@saltcorn/data/db");
const { getCompletion, getEmbedding } = require("./generate");
const { OPENAI_MODELS } = require("./constants.js");

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

let initialConfig;
const functions = (config) => {
  initialConfig = JSON.stringify(config);
  return {
    llm_generate: {
      run: async (prompt, opts) => {
        let changedBefore = false;
        if (JSON.stringify(config) !== initialConfig) {
          console.error(
            "LLM CONFIG CHANGED BEFORE COMPLETION RUN",
            initialConfig,
            JSON.stringify(config)
          );
          changedBefore = true;
        }
        const result = await getCompletion(config, { prompt, ...opts });
        if (JSON.stringify(config) !== initialConfig && !changedBefore) {
          console.error(
            "LLM CONFIG CHANGED AFTER COMPLETION RUN",
            initialConfig,
            JSON.stringify(config)
          );
        }
        return result;
      },
      isAsync: true,
      description: "Generate text with GPT",
      arguments: [{ name: "prompt", type: "String" }],
    },
    llm_embedding: {
      run: async (prompt, opts) => {
        let changedBefore = false;
        if (JSON.stringify(config) !== initialConfig) {
          console.error(
            "LLM CONFIG CHANGED BEFORE EMBEDDING RUN",
            initialConfig,
            JSON.stringify(config)
          );
          changedBefore = true;
        }

        const result = await getEmbedding(config, { prompt, ...opts });
        if (JSON.stringify(config) !== initialConfig && !changedBefore) {
          console.error(
            "LLM CONFIG CHANGED AFTER EMBEDDING RUN",
            initialConfig,
            JSON.stringify(config)
          );
        }
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
  }),
};
