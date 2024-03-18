const fetch = require("node-fetch");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const db = require("@saltcorn/data/db");
const { Ollama } = require("ollama");

const getEmbedding = async (config, opts) => {
  switch (config.backend) {
    case "OpenAI":
      return await getEmbeddingOpenAICompatible(
        {
          embeddingsEndpoint: "https://api.openai.com/v1/embeddings",
          bearer: config.api_key,
          embed_model: config.embed_model,
        },
        opts
      );
    case "OpenAI-compatible API":
      return await getEmbeddingOpenAICompatible(
        {
          embeddingsEndpoint: config.embed_endpoint,
          bearer: config.api_key,
          embed_model: config.model,
        },
        opts
      );
    case "Local Ollama":
      const ollama = new Ollama();
      const olres = await ollama.embeddings({
        model: opts?.model || config.model,
        prompt: opts.prompt,
      });
      //console.log("embedding response ", olres);
      return olres.embedding;
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
          bearer: config.api_key,
          model: config.model,
        },
        opts
      );
    case "OpenAI-compatible API":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: config.endpoint,
          bearer: config.bearer,
          model: config.model,
        },
        opts
      );
    case "Local Ollama":
      const ollama = new Ollama();
      const olres = await ollama.generate({
        model: config.model,
        prompt: opts.prompt,
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
      console.log("running llama with prompt: ", opts.prompt);

      const { stdout, stderr } = await exec(
        `./main -m ${config.model_path} -p "${opts.prompt}" ${nstr}${hyperStr}`,
        { cwd: config.llama_dir }
      );
      return stdout;
    default:
      break;
  }
};

const getCompletionOpenAICompatible = async (
  { chatCompleteEndpoint, bearer, model },
  { systemPrompt, prompt, temperature }
) => {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  const body = {
    //prompt: "How are you?",
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt || "You are a helpful assistant.",
      },
      { role: "user", content: prompt },
    ],
    temperature: temperature || 0.7,
  };
  const rawResponse = await fetch(chatCompleteEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const results = await rawResponse.json();
  console.log(results);

  return results?.choices?.[0]?.message?.content;
};

const getEmbeddingOpenAICompatible = async (config, { prompt, model }) => {
  const { embeddingsEndpoint, bearer, embed_model } = config;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  const body = {
    //prompt: "How are you?",
    model: model || embed_model || "text-embedding-3-small",
    input: prompt,
  };
  console.log({ body, config });
  const rawResponse = await fetch(embeddingsEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const results = await rawResponse.json();
  console.log(results);

  return results?.data?.[0]?.embedding;
};
module.exports = { getCompletion, getEmbedding };
