const OPENAI_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.4",
  "o3",
  "o3-mini",
  "o3-pro",
  "o4-mini",
  "codex-mini-latest",
  "gpt-5-codex",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5.1-codex-max",
];

const NO_TEMP_MODELS = [
  "o1",
  "o3",
  "o3-mini",
  "o4-mini",
  "gpt-5",
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.2",
  "gpt-5.4",
];

// https://github.com/ollama/ollama/blob/main/docs/faq.md#where-are-models-stored
const OLLAMA_MODELS_PATH = {
  Darwin: `${process.env.HOME}/.ollama/models`,
  Linux: "/usr/share/ollama/.ollama/models",
  Windows_NT: "C:\\Users\\%username%\\.ollama\\models.",
};

module.exports = { OPENAI_MODELS, OLLAMA_MODELS_PATH, NO_TEMP_MODELS };
