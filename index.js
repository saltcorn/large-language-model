const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Plugin = require("@saltcorn/data/models/plugin");
const { domReady } = require("@saltcorn/markup/tags");
const db = require("@saltcorn/data/db");
const { getCompletion, getEmbedding } = require("./generate");
const { OPENAI_MODELS } = require("./constants.js");
const { eval_expression } = require("@saltcorn/data/models/expression");
const { interpolate } = require("@saltcorn/data/utils");
const { getState } = require("@saltcorn/data/db/state");
const { google } = require("googleapis");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "API key",
        form: async (context) => {
          const isRoot = db.getTenantSchema() === db.connectObj.default_schema;
          return new Form({
            additionalHeaders: [
              {
                headerTag: `<script>
function backendChange(e) {
  const val = e.value;
  const authBtn = document.getElementById('vertex_authorize_btn');
  if (val === 'Google Vertex AI') {
    authBtn.classList.remove('d-none');
  } else {
    authBtn.classList.add('d-none');
  }
}
${domReady(`
  const backend = document.getElementById('inputbackend');
  if (backend) {
    backendChange(backend);
  }`)}
</script>`,
              },
            ],
            additionalButtons: [
              {
                label: "authorize",
                id: "vertex_authorize_btn",
                onclick:
                  "location.href='/large-language-model/vertex/authorize'",
                class: "btn btn-primary d-none",
              },
            ],
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
                    "Google Vertex AI",
                  ],
                  onChange: "backendChange(this)",
                },
              },
              {
                name: "client_id",
                label: "Client ID",
                sublabel: "OAuth2 client ID from your Google Cloud account",
                type: "String",
                required: true,
                showIf: { backend: "Google Vertex AI" },
              },
              {
                name: "client_secret",
                label: "Client Secret",
                sublabel: "Client secret from your Google Cloud account",
                type: "String",
                required: true,
                showIf: { backend: "Google Vertex AI" },
              },
              {
                name: "project_id",
                label: "Project ID",
                sublabel: "Google Cloud project ID",
                type: "String",
                required: true,
                showIf: { backend: "Google Vertex AI" },
              },
              {
                name: "model",
                label: "Model",
                type: "String",
                showIf: { backend: "Google Vertex AI" },
                attributes: {
                  options: [
                    "gemini-1.5-pro",
                    "gemini-1.5-flash",
                    "gemini-2.0-flash",
                  ],
                },
                required: true,
              },
              {
                name: "embed_model",
                label: "Embedding model",
                type: "String",
                required: true,
                showIf: { backend: "Google Vertex AI" },
                attributes: {
                  options: [
                    "text-embedding-005",
                    "text-embedding-004",
                    "textembedding-gecko@003",
                  ],
                },
                default: "text-embedding-005",
              },
              {
                name: "embed_task_type",
                label: "Embedding task type",
                type: "String",
                showIf: { backend: "Google Vertex AI" },
                attributes: {
                  options: [
                    "RETRIEVAL_QUERY",
                    "RETRIEVAL_DOCUMENT",
                    "SEMANTIC_SIMILARITY",
                    "CLASSIFICATION",
                    "CLUSTERING",
                    "QUESTION_ANSWERING",
                    "FACT_VERIFICATION",
                    "CODE_RETRIEVAL_QUERY",
                  ],
                },
                default: "RETRIEVAL_QUERY",
              },
              {
                name: "region",
                label: "Region",
                sublabel: "Google Cloud region (default: us-central1)",
                type: "String",
                showIf: { backend: "Google Vertex AI" },
                default: "us-central1",
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
                name: "api_key",
                label: "API key",
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
              {
                input_type: "section_header",
                label: "Alternative configurations",
                showIf: { backend: "OpenAI-compatible API" },
              },
              new FieldRepeat({
                name: "altconfigs",
                label: "Alternative configurations",
                showIf: { backend: "OpenAI-compatible API" },
                fields: [
                  { name: "name", label: "Configuration name", type: "String" },
                  {
                    name: "model",
                    label: "Model",
                    type: "String",
                  },
                  {
                    name: "endpoint",
                    label: "Endpoint",
                    type: "String",
                  },
                  {
                    name: "bearer_auth",
                    label: "Bearer Auth",
                    type: "String",
                  },
                  {
                    name: "api_key",
                    label: "API key",
                    type: "String",
                  },
                ],
              }),
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

const routes = (config) => {
  return [
    {
      url: "/large-language-model/vertex/authorize",
      method: "get",
      callback: async (req, res) => {
        const { client_id, client_secret } = config || {};
        const baseUrl = (
          getState().getConfig("base_url") || "http://localhost:3000"
        ).replace(/\/$/, "");
        const redirect_uri = `${baseUrl}/large-language-model/vertex/callback`;
        const oauth2Client = new google.auth.OAuth2(
          client_id,
          client_secret,
          redirect_uri
        );
        const authUrl = oauth2Client.generateAuthUrl({
          access_type: "offline",
          scope: "https://www.googleapis.com/auth/cloud-platform",
          prompt: "consent",
        });
        res.redirect(authUrl);
      },
    },
    {
      url: "/large-language-model/vertex/callback",
      method: "get",
      callback: async (req, res) => {
        const { client_id, client_secret } = config || {};
        const baseUrl = (
          getState().getConfig("base_url") || "http://localhost:3000"
        ).replace(/\/$/, "");
        const redirect_uri = `${baseUrl}/large-language-model/vertex/callback`;
        const oauth2Client = new google.auth.OAuth2(
          client_id,
          client_secret,
          redirect_uri
        );
        let plugin = await Plugin.findOne({ name: "large-language-model" });
        if (!plugin) {
          plugin = await Plugin.findOne({
            name: "@saltcorn/large-language-model",
          });
        }
        try {
          const code = req.query.code;
          if (!code) throw new Error("Missing code in query string.");
          const { tokens } = await oauth2Client.getToken(code);
          if (!tokens.refresh_token) {
            req.flash(
              "warning",
              req.__(
                "No refresh token received. Please revoke the plugin's access and try again."
              )
            );
          } else {
            const newConfig = { ...(plugin.configuration || {}), tokens };
            plugin.configuration = newConfig;
            await plugin.upsert();
            getState().processSend({
              refresh_plugin_cfg: plugin.name,
              tenant: db.getTenantSchema(),
            });
            req.flash(
              "success",
              req.__("Authentication successful! You can now use Vertex AI.")
            );
          }
        } catch (error) {
          console.error("Error retrieving access token:", error);
          req.flash("error", req.__("Error retrieving access"));
        } finally {
          res.redirect(`/plugins/configure/${encodeURIComponent(plugin.name)}`);
        }
      },
    },
  ];
};

module.exports = {
  sc_plugin_api_version: 1,
  configuration_workflow,
  functions,
  modelpatterns: require("./model.js"),
  routes,
  actions: (config) => ({
    llm_function_call: require("./function-insert-action.js")(config),
    llm_generate: {
      description: "Generate text with AI based on a text prompt",
      requireRow: true,
      configFields: ({ table, mode }) => {
        const override_fields =
          config.backend === "OpenAI-compatible API" &&
          (config.altconfigs || []).filter((c) => c.name).length
            ? [
                {
                  name: "override_config",
                  label: "Alternative LLM configuration",
                  type: "String",
                  attributes: { options: config.altconfigs.map((c) => c.name) },
                },
              ]
            : [];

        if (mode === "workflow") {
          return [
            {
              name: "prompt_template",
              label: "Prompt",
              sublabel:
                "Prompt text. Use interpolations {{ }} to access variables in the context",
              type: "String",
              fieldview: "textarea",
              required: true,
            },
            {
              name: "answer_field",
              label: "Answer variable",
              sublabel: "Set the generated answer to this context variable",
              type: "String",
              required: true,
            },
            {
              name: "chat_history_field",
              label: "Chat history variable",
              sublabel:
                "Use this context variable to store the chat history for subsequent prompts",
              type: "String",
            },
            ...override_fields,
          ];
        } else if (table) {
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
          prompt_template,
          answer_field,
          override_config,
          chat_history_field,
        },
      }) => {
        let prompt;
        if (mode === "workflow")
          prompt = interpolate(prompt_template, row, user);
        else if (prompt_field === "Formula" || mode === "workflow")
          prompt = eval_expression(
            prompt_formula,
            row,
            user,
            "llm_generate prompt formula"
          );
        else prompt = row[prompt_field];
        const opts = {};
        if (override_config) {
          const altcfg = config.altconfigs.find(
            (c) => c.name === override_config
          );
          opts.endpoint = altcfg.endpoint;
          opts.model = altcfg.model;
          opts.api_key = altcfg.api_key;
          opts.bearer = altcfg.bearer;
        }
        let history = [];
        if (chat_history_field && row[chat_history_field]) {
          history = row[chat_history_field];
        }
        const ans = await getCompletion(config, {
          prompt,
          chat: history,
          ...opts,
        });
        const upd = { [answer_field]: ans };
        if (chat_history_field) {
          upd[chat_history_field] = [
            ...history,
            { role: "user", content: prompt },
            { role: "assistant", content: ans },
          ];
        }
        if (mode === "workflow") return upd;
        else await table.updateRow(upd, row[table.pk_name]);
      },
    },
    llm_generate_json: {
      description:
        "Generate JSON with AI based on a text prompt. You must sppecify the JSON fields in the configuration.",
      requireRow: true,
      configFields: ({ table, mode }) => {
        const override_fields =
          config.backend === "OpenAI-compatible API" &&
          (config.altconfigs || []).filter((c) => c.name).length
            ? [
                {
                  name: "override_config",
                  label: "Alternative LLM configuration",
                  type: "String",
                  attributes: { options: config.altconfigs.map((c) => c.name) },
                },
              ]
            : [];
        const cfgFields = [];
        const fieldsField = new FieldRepeat({
          name: "fields",
          fields: [
            {
              name: "name",
              label: "Name",
              sublabel: "The field name, as a valid JavaScript identifier",
              type: "String",
              required: true,
            },
            {
              label: "Description",
              name: "description",
              sublabel: "A description of the field.",
              type: "String",
            },
            {
              name: "type",
              label: "Type",
              type: "String",
              required: true,
              attributes: {
                options: ["string", "integer", "number", "boolean"],
              },
            },
          ],
        });

        if (mode === "workflow") {
          cfgFields.push(
            {
              name: "prompt_template",
              label: "Prompt",
              sublabel:
                "Prompt text. Use interpolations {{ }} to access variables in the context",
              type: "String",
              fieldview: "textarea",
              required: true,
            },
            {
              name: "answer_field",
              label: "Answer variable",
              sublabel: "Set the generated answer to this context variable",
              type: "String",
              required: true,
            },
            {
              name: "chat_history_field",
              label: "Chat history variable",
              sublabel:
                "Use this context variable to store the chat history for subsequent prompts",
              type: "String",
            }
          );
        } else if (table) {
          const jsonFields = table.fields
            .filter((f) => f.type?.name === "JSON")
            .map((f) => f.name);

          cfgFields.push(
            {
              name: "prompt_template",
              label: "Prompt",
              sublabel:
                "Prompt text. Use interpolations {{ }} to access variables in the row",
              type: "String",
              fieldview: "textarea",
              required: true,
            },
            {
              name: "answer_field",
              label: "Answer field",
              sublabel: "Output field will be set to the generated data",
              type: "String",
              required: true,
              attributes: { options: jsonFields },
            }
          );
        }

        cfgFields.push(
          ...override_fields,
          {
            name: "multiple",
            label: "Multiple",
            type: "Bool",
            sublabel:
              "Select (true) to generate an array of objects. Unselect (false) for a single object",
          },
          {
            name: "gen_description",
            label: "Description",
            sublabel: "A short description of what you want to generate.",
            type: "String",
          },
          {
            input_type: "section_header",
            label: "JSON fields to generate",
          },
          fieldsField
        );
        return cfgFields;
      },
      run: async ({
        row,
        table,
        user,
        mode,
        configuration: {
          prompt_template,
          fields,
          mulitple,
          gen_description,
          answer_field,
          override_config,
          chat_history_field,
        },
      }) => {
        let prompt = interpolate(prompt_template, row, user);

        const opts = {};
        if (override_config) {
          const altcfg = config.altconfigs.find(
            (c) => c.name === override_config
          );
          opts.endpoint = altcfg.endpoint;
          opts.model = altcfg.model;
          opts.api_key = altcfg.api_key;
          opts.bearer = altcfg.bearer;
        }
        let history = [];
        if (chat_history_field && row[chat_history_field]) {
          history = row[chat_history_field];
        }
        const fieldArgs = {};
        (fields || []).forEach((field) => {
          fieldArgs[field.name] = {
            type: field.type,
            description: field.description,
          };
        });
        const argObj = { type: "object", properties: fieldArgs };
        const args = {
          [answer_field]: mulitple ? { type: "array", items: argObj } : argObj,
        };
        const expert_function = {
          type: "function",
          function: {
            name: answer_field,
            description: gen_description || undefined,
            parameters: {
              type: "object",
              properties: args,
            },
          },
        };
        const toolargs = {
          tools: [expert_function],
          tool_choice: { type: "function", function: { name: answer_field } },
        };
        const compl = await getCompletion(config, {
          prompt,
          chat: history,
          ...opts,
          ...toolargs,
        });
        const ans = JSON.parse(compl.tool_calls[0].function.arguments)[
          answer_field
        ];
        const upd = { [answer_field]: ans };
        if (chat_history_field) {
          upd[chat_history_field] = [
            ...history,
            { role: "user", content: prompt },
            { role: "assistant", content: ans },
          ];
        }
        if (mode === "workflow") return upd;
        else await table.updateRow(upd, row[table.pk_name]);
      },
    },
  }),
};
