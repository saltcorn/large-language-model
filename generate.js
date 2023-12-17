const axios = require("axios");

const getCompletion = async (config, opts) => {
  switch (config.backend) {
    case "OpenAI":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: "https://api.openai.com/v1/chat/completions",
          bearer: config.api_key,
          model: config.model,
        },
        config,
        opts
      );
    case "OpenAI-compatible API":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: config.endpoint,
          bearer: config.bearer,
          model: config.model,
        },
        config,
        opts
      );
    default:
      break;
  }
};

const getCompletionOpenAICompatible = async (
  { chatCompleteEndpoint, bearer, model },
  { systemPrompt, prompt, temperature }
) => {
  const client = axios.create({
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: "Bearer " + bearer } : {}),
    },
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

  return results;
};

module.exports = { getCompletion };
