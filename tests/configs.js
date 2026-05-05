const configs = [];

if (process.env.OPENAI_API_KEY) {
  configs.push(
    {
      name: "OpenAI completions",
      model: "gpt-5.1",
      api_key: process.env.OPENAI_API_KEY,
      backend: "OpenAI",
      embed_model: "text-embedding-3-small",
      image_model: "gpt-image-1",
      temperature: 0.7,
      responses_api: false,
      ai_sdk_provider: "OpenAI",
    },
    {
      name: "OpenAI responses",
      model: "gpt-5.1",
      api_key: process.env.OPENAI_API_KEY,
      backend: "OpenAI",
      embed_model: "text-embedding-3-small",
      image_model: "gpt-image-1",
      temperature: 0.7,
      responses_api: true,
      ai_sdk_provider: "OpenAI",
    },
    {
      name: "AI SDK OpenAI",
      model: "gpt-5.1",
      api_key: process.env.OPENAI_API_KEY,
      backend: "AI SDK",
      embed_model: "text-embedding-3-small",
      image_model: "gpt-image-1",
      temperature: 0.7,
      ai_sdk_provider: "OpenAI",
    },
  );
}

if (process.env.ANTHROPIC_API_KEY) {
  configs.push({
    name: "AI SDK Anthropic",
    model: "claude-sonnet-4-6",
    anthropic_api_key: process.env.ANTHROPIC_API_KEY,
    backend: "AI SDK",
    temperature: 0.7,
    ai_sdk_provider: "Anthropic",
    skipTests: ["embedding"],
  });
}

if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  configs.push({
    name: "AI SDK Google",
    model: "gemini-2.5-flash",
    google_api_key: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    backend: "AI SDK",
    embed_model: "gemini-embedding-001",
    temperature: 0.7,
    ai_sdk_provider: "Google",
    skipTests: ["uses tools", "tool use sequence"],
  });
}

if (process.env.OPENROUTER_API_KEY) {
  configs.push({
    name: "AI SDK OpenRouter",
    model: "openai/gpt-4o",
    openrouter_api_key: process.env.OPENROUTER_API_KEY,
    backend: "AI SDK",
    temperature: 0.7,
    ai_sdk_provider: "OpenRouter",
    skipTests: ["embedding", "tool use sequence"],
  });
}

module.exports = configs;
