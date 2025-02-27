const fetch = require("node-fetch");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const db = require("@saltcorn/data/db");
const { VertexAI } = require("@google-cloud/vertexai");
const {
  PredictionServiceClient,
  helpers,
} = require("@google-cloud/aiplatform");
const { google } = require("googleapis");
const Plugin = require("@saltcorn/data/models/plugin");

const { features, getState } = require("@saltcorn/data/db/state");
let ollamaMod;
if (features.esm_plugins) ollamaMod = require("ollama");

const getEmbedding = async (config, opts) => {
  switch (config.backend) {
    case "OpenAI":
      return await getEmbeddingOpenAICompatible(
        {
          embeddingsEndpoint: "https://api.openai.com/v1/embeddings",
          bearer: opts?.api_key || config.api_key,
          embed_model: opts?.model || config.embed_model,
        },
        opts
      );
    case "OpenAI-compatible API":
      return await getEmbeddingOpenAICompatible(
        {
          embeddingsEndpoint: opts?.endpoint || config.embed_endpoint,
          bearer: opts?.bearer || opts?.api_key || config.api_key,
          apiKey: opts?.api_key || config.api_key,
          embed_model:
            opts?.embed_model ||
            opts?.model ||
            config.embed_model ||
            config.model,
        },
        opts
      );
    case "Local Ollama":
      if (config.embed_endpoint) {
        return await getEmbeddingOpenAICompatible(
          {
            embeddingsEndpoint: config.embed_endpoint,
            embed_model:
              opts?.embed_model ||
              opts?.model ||
              config.embed_model ||
              config.model,
          },
          opts
        );
      } else {
        if (!ollamaMod) throw new Error("Not implemented for this backend");

        const { Ollama } = ollamaMod;
        const ollama = new Ollama();
        const olres = await ollama.embeddings({
          model: opts?.model || config.embed_model || config.model,
          prompt: opts.prompt,
        });
        //console.log("embedding response ", olres);
        return olres.embedding;
      }
    case "Google Vertex AI":
      const oauth2Client = await initOAuth2Client(config);
      if (oauth2Client.isTokenExpiring()) {
        const { credentials } = await oauth2Client.refreshAccessToken();
        await updatePluginTokenCfg(credentials);
      }
      return await getEmbeddingGoogleVertex(config, opts, oauth2Client);
    default:
      throw new Error("Not implemented for this backend");
  }
};

const getCompletion = async (config, opts) => {
  switch (config.backend) {
    case "OpenAI":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: "https://api.openai.com/v1/chat/completions",
          bearer: opts?.api_key || opts?.bearer || config.api_key,
          model: opts?.model || config.model,
        },
        opts
      );
    case "OpenAI-compatible API":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: opts?.endpoint || config.endpoint,
          bearer:
            opts?.bearer ||
            opts?.api_key ||
            config.bearer_auth ||
            config.bearer,
          apiKey: opts?.api_key || config.api_key,
          model: opts?.model || config.model,
        },
        opts
      );
    case "Local Ollama":
      if (!ollamaMod) throw new Error("Not implemented for this backend");

      const { Ollama } = ollamaMod;

      const ollama = new Ollama();
      const olres = await ollama.generate({
        model: opts?.model || config.model,
        ...opts,
      });
      //console.log("the response ", olres);
      return olres.response;
    case "Local llama.cpp":
      //TODO only check if unsafe plugins not allowed
      const isRoot = db.getTenantSchema() === db.connectObj.default_schema;
      if (!isRoot)
        throw new Error(
          "llama.cpp inference is not permitted on subdomain tenants"
        );
      let hyperStr = "";
      if (opts.temperature) hyperStr += ` --temp ${opts.temperature}`;
      let nstr = "";
      if (opts.ntokens) nstr = `-n ${opts.ntokens}`;
      //console.log("running llama with prompt: ", opts.prompt);

      const { stdout, stderr } = await exec(
        `./main -m ${config.model_path} -p "${opts.prompt}" ${nstr}${hyperStr}`,
        { cwd: config.llama_dir }
      );
      return stdout;
    case "Google Vertex AI":
      const oauth2Client = await initOAuth2Client(config);
      if (oauth2Client.isTokenExpiring()) {
        const { credentials } = await oauth2Client.refreshAccessToken();
        await updatePluginTokenCfg(credentials);
      }
      return await getCompletionGoogleVertex(config, opts, oauth2Client);
    default:
      break;
  }
};

const getCompletionOpenAICompatible = async (
  { chatCompleteEndpoint, bearer, apiKey, model },
  {
    systemPrompt,
    prompt,
    temperature,
    debugResult,
    chat = [],
    api_key,
    endpoint,
    ...rest
  }
) => {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  if (apiKey) headers["api-key"] = apiKey;
  const body = {
    //prompt: "How are you?",
    model: rest.model || model,
    messages: [
      {
        role: "system",
        content: systemPrompt || "You are a helpful assistant.",
      },
      ...chat,
      { role: "user", content: prompt },
    ],
    temperature: temperature || 0.7,
    ...rest,
  };
  if (debugResult)
    console.log(
      "OpenAI request",
      JSON.stringify(body, null, 2),
      "to",
      chatCompleteEndpoint,
      "headers",
      JSON.stringify(headers)
    );
  const rawResponse = await fetch(chatCompleteEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const results = await rawResponse.json();
  if (debugResult)
    console.log("OpenAI response", JSON.stringify(results, null, 2));
  if (results.error) throw new Error(`OpenAI error: ${results.error.message}`);

  return results?.choices?.[0]?.message?.tool_calls
    ? {
        tool_calls: results?.choices?.[0]?.message?.tool_calls,
        content: results?.choices?.[0]?.message?.content || null,
      }
    : results?.choices?.[0]?.message?.content || null;
};

const getEmbeddingOpenAICompatible = async (
  config,
  { prompt, model, debugResult }
) => {
  const { embeddingsEndpoint, bearer, apiKey, embed_model } = config;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  if (apiKey) headers["api-key"] = apiKey;
  const body = {
    //prompt: "How are you?",
    model: model || embed_model || "text-embedding-3-small",
    input: prompt,
  };

  const rawResponse = await fetch(embeddingsEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const results = await rawResponse.json();
  if (debugResult)
    console.log("OpenAI response", JSON.stringify(results, null, 2));
  if (results.error) throw new Error(`OpenAI error: ${results.error.message}`);
  if (Array.isArray(prompt)) return results?.data?.map?.((d) => d?.embedding);
  return results?.data?.[0]?.embedding;
};

const updatePluginTokenCfg = async (credentials) => {
  let plugin = await Plugin.findOne({ name: "large-language-model" });
  if (!plugin) {
    plugin = await Plugin.findOne({
      name: "@saltcorn/large-language-model",
    });
  }
  const newConfig = {
    ...(plugin.configuration || {}),
    tokens: credentials,
  };
  plugin.configuration = newConfig;
  await plugin.upsert();
  getState().processSend({
    refresh_plugin_cfg: plugin.name,
    tenant: db.getTenantSchema(),
  });
};

const initOAuth2Client = async (config) => {
  const { client_id, client_secret } = config || {};
  const state = getState();
  const pluginCfg =
    state.plugin_cfgs["large-language-model"] ||
    state.plugin_cfgs["@saltcorn/large-language-model"];
  const baseUrl = (
    getState().getConfig("base_url") || "http://localhost:3000"
  ).replace(/\/$/, "");
  const redirect_uri = `${baseUrl}/callback`;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uri
  );
  oauth2Client.setCredentials(pluginCfg.tokens);
  return oauth2Client;
};

const convertChatToVertex = (chat) => {
  const history = [];
  for (const message of chat) {
    const role = message.role === "user" ? "user" : "model";
    if (message.content) {
      const parts = [{ text: message.content }];
      history.push([{ role, parts }]);
    } else if (message.tool_calls) {
      const parts = [
        { functionCall: prepFuncArgsFromChat(message.tool_calls[0].function) },
      ];
      history.push([{ role, parts }]);
    }
  }
  return history;
};

const prepFuncArgsFromChat = (fCall) => {
  if (!fCall.arguments) return fCall;
  else {
    const copy = JSON.parse(JSON.stringify(fCall));
    copy.args = JSON.parse(copy.arguments);
    delete copy.arguments;
    return copy;
  }
};

const prepFuncArgsForChat = (fCall) => {
  if (!fCall.args) return fCall;
  else {
    const copy = JSON.parse(JSON.stringify(fCall));
    copy.arguments = JSON.stringify(copy.args);
    delete copy.args;
    return copy;
  }
};

const getCompletionGoogleVertex = async (config, opts, oauth2Client) => {
  const vertexAI = new VertexAI({
    project: config.project_id,
    location: config.region || "us-central1",
    googleAuthOptions: {
      authClient: oauth2Client,
    },
  });
  const generativeModel = vertexAI.getGenerativeModel({
    model: config.model,
  });
  const chat = generativeModel.startChat({
    tools: [
      {
        functionDeclarations: opts.tools.map((t) => t.function),
      },
    ],
    history: convertChatToVertex(opts.chat),
    systemInstructions: opts.systemPrompt || "You are a helpful assistant.",
  });
  const { response } = await chat.sendMessage([{ text: opts.prompt }]);
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!parts) return "";
  else if (parts.length === 1 && parts[0].text) return parts[0].text;
  else {
    const result = {};
    for (const part of parts) {
      if (part.functionCall) {
        const toolCall = {
          function: prepFuncArgsForChat(part.functionCall),
        };
        if (!result.tool_calls) result.tool_calls = [toolCall];
        else result.tool_calls.push(toolCall);
      }
      if (part.text)
        result.content = !result.content
          ? part.text
          : result.content + part.text;
    }
    return result;
  }
};

const getEmbeddingGoogleVertex = async (config, opts, oauth2Client) => {
  const predClient = new PredictionServiceClient({
    apiEndpoint: "us-central1-aiplatform.googleapis.com",
    authClient: oauth2Client,
  });
  const model = config.embed_model || "text-embedding-005";
  let instances = null;
  if (Array.isArray(opts.prompt)) {
    instances = opts.prompt.map((p) =>
      helpers.toValue({
        content: p,
        task_type: config.task_type || "RETRIEVAL_QUERY",
      })
    );
  } else {
    instances = [
      helpers.toValue({
        content: opts.prompt,
        task_type: config.task_type || "RETRIEVAL_QUERY",
      }),
    ];
  }
  const [response] = await predClient.predict({
    endpoint: `projects/${config.project_id}/locations/${
      config.region || "us-central1"
    }/publishers/google/models/${model}`,
    instances,
    // default outputDimensionality is 768, can be changed with:
    // parameters: helpers.toValue({ outputDimensionality: parseInt(512) }),
  });
  const predictions = response.predictions;
  const embeddings = predictions.map((p) => {
    const embeddingsProto = p.structValue.fields.embeddings;
    const valuesProto = embeddingsProto.structValue.fields.values;
    return valuesProto.listValue.values.map((v) => v.numberValue);
  });
  return embeddings;
};

module.exports = { getCompletion, getEmbedding };
