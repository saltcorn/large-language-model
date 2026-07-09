const GOOGLE_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  // "gemini-2.0-flash",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-image-preview",
  "gemini-3.1-flash-lite-preview",
  "gemma-3-27b-it",
  "gemma-3-12b-it",
];

const GOOGLE_EMBED_MODELS = [
  "gemini-embedding-001",
  "gemini-embedding-2-preview",
  "text-embedding-004",
];

const GOOGLE_IMAGE_MODELS = [
  "imagen-4.0-generate-001",
  "imagen-4.0-ultra-generate-001",
  "imagen-4.0-fast-generate-001",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview",
];

const OPENAI_IMAGE_MODELS = [
  "gpt-image-1",
  "gpt-image-2",
  "dall-e-3",
  "dall-e-2",
];

const OPENAI_TTS_MODELS = ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"];

const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
];

const OPENAI_MODELS = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "o3",
  "o3-mini",
  "o3-pro",
  "o4-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
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
  "gpt-5.5",
  "claude-opus-4-8",
  "claude-opus-4-7",
];

// https://github.com/ollama/ollama/blob/main/docs/faq.md#where-are-models-stored
const OLLAMA_MODELS_PATH = {
  Darwin: `${process.env.HOME}/.ollama/models`,
  Linux: "/usr/share/ollama/.ollama/models",
  Windows_NT: "C:\\Users\\%username%\\.ollama\\models.",
};

module.exports = {
  OPENAI_MODELS,
  OLLAMA_MODELS_PATH,
  NO_TEMP_MODELS,
  GOOGLE_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_IMAGE_MODELS,
  OPENAI_IMAGE_MODELS,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
};
