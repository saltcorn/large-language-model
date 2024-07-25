const OPENAI_MODELS = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo-0613",
  "gpt-3.5-turbo-16k-0613",
  "gpt-4o-mini",
  "gpt-4",
  "gpt-4-32k",
  "gpt-4-turbo-preview",
  "gpt-4-1106-preview",
  "gpt-4-0125-preview",
  "gpt-4-turbo",
  "gpt-4o",
];

// https://github.com/ollama/ollama/blob/main/docs/faq.md#where-are-models-stored
const OLLAMA_MODELS_PATH = {
  Darwin: `${process.env.HOME}/.ollama/models`,
  Linux: "/usr/share/ollama/.ollama/models",
  Windows_NT: "C:\\Users\\%username%\\.ollama\\models.",
};

module.exports = { OPENAI_MODELS, OLLAMA_MODELS_PATH };
