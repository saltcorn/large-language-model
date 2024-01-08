const axios = require("axios");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const db = require("@saltcorn/data/db");

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
  };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  const client = axios.create({
    headers,
  });
  const params = {
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

  const results = await client.post(chatCompleteEndpoint, params);
  return results?.data?.choices?.[0]?.message?.content;
};

module.exports = { getCompletion };
