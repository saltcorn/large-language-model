const fetch = require("node-fetch");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const db = require("@saltcorn/data/db");
const { VertexAI } = require("@google-cloud/vertexai");
const { google } = require("googleapis");
const fs = require("fs").promises;
const path = require("path");

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
      const { client_id, client_secret, project_id } = config || {};
      const baseUrl = (
        getState().getConfig("base_url") || "http://localhost:3000"
      ).replace(/\/$/, "");
      const redirect_uri = `${baseUrl}/callback`;
      const oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uri
      );
      // TODO get the tokens from the state and refresh after a hour
      const tokens = JSON.parse(
        await fs.readFile(path.join(__dirname, "tokens.json"))
      );
      oauth2Client.setCredentials(tokens);
      const vertexAI = new VertexAI({
        project: project_id,
        googleAuthOptions: {
          authClient: oauth2Client,
        },
      });

      // TODO cfg parameter
      const textModel = "gemini-1.5-flash"; // "gemini-1.5-pro";
      const generativeModel = vertexAI.getGenerativeModel({
        model: textModel,
      });
      const chat = generativeModel.startChat();
      const result = await chat.sendMessageStream(opts.prompt);
      const chunks = [];
      for await (const item of result.stream) {
        chunks.push(item.candidates[0].content.parts[0].text);
      }
      return chunks.join("\n");
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

  return (
    results?.choices?.[0]?.message?.content ||
    (results?.choices?.[0]?.message?.tool_calls
      ? { tool_calls: results?.choices?.[0]?.message?.tool_calls }
      : null)
  );
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
module.exports = { getCompletion, getEmbedding };
