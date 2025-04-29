[![Saltcorn LLM Add-on Banner](https://user-images.githubusercontent.com/66894759/159173453-2ca63e71-1ff5-4f1e-b551-58b157b0de52.png)](https://saltcorn.com)

> **Large-Language-Model Add-on (Production City fork)**  
> Advanced generative AI, vector embedding and multimodal capabilities for [Saltcorn](https://saltcorn.com).

[![MIT Licence](https://img.shields.io/badge/licence-MIT-green.svg)](LICENCE)

---

# Overview

This repository is a **fully-featured fork** of the official Saltcorn “Large-Language-Model” plug-in.  
It super-charges Saltcorn with modern AI tooling while keeping the familiar no-code authoring
experience intact.

Key improvements over the upstream version include:

| Area                              | What’s new in this fork                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Multi-backend engine**          | • OpenAI (first-party API) • Generic OpenAI-compatible endpoints • Local **Ollama** • Local **llama.cpp** • **Google Vertex AI** |
| **Model catalogue**               | 150 + OpenAI models (chat / image / embedding / reasoning) are maintained in **`models-openai.json`** and surfaced in the UI. |
| **Modalities**                    | Text, images (DALL·E 2/3, GPT-Image 1), embeddings, audio preview models – with schema-aware validation. |
| **Function calling**              | Dedicated “LLM function-call ⇒ row insert” action – map structured arguments directly to table inserts. |
| **Rich configuration UI**         | Dynamic widgets based on the selected model’s capabilities, live documentation panel, “Test model” button. |
| **Server-side helpers**           | • `llm_generate()` • `llm_embedding()` • `llm_generate_image()` – callable from Formulas, Workflows, JS etc. |
| **ML pattern integration**        | “LargeLanguageModel” pattern for Saltcorn’s Machine-Learning module – prediction without training. |
| **Dev-container ready**           | `.devcontainer/` with Docker Compose stack (Saltcorn + PostGIS) for one-command hacking.               |
| **Type-safe OpenAI registry**     | Static metadata generator (`scripts/build-models.ts`) keeps the model list and JSON schema in sync.    |
| **Test coverage**                 | Lightweight Jest-free tests for critical helpers (see `tests/`).                                       |

---

# Table of contents

1. [Features](#features)  
2. [Installation](#installation)  
3. [Quick start](#quick-start)  
4. [Configuration](#configuration)  
5. [Runtime functions](#runtime-functions)  
6. [Actions](#actions)  
7. [Model pattern](#model-pattern)  
8. [Developer guide](#developer-guide)  
9. [Contributing](#contributing)  
10. [Licence](#licence)

---

## Features

### Multi-backend support

| Backend               | Text chat | Embeddings | Images | Audio / TTS | Function calling | Notes |
| --------------------- | :-------: | :--------: | :----: | :---------: | :--------------: | ----- |
| **OpenAI**            | ✔︎        | ✔︎         | ✔︎     | -            | ✔︎               | Native REST |
| OpenAI-compatible API | ✔︎        | ✔︎         | –      | –           | ✔︎ (depends)     | Azure / local replicas |
| **Google Vertex AI**  | ✔︎        | ✔︎         | –      | –           | ✔︎ (function calls) | OAuth 2 flow built-in |
| **Local Ollama**      | ✔︎        | ✔︎         | –      | –           | –                | Needs Ollama daemon |
| **Local llama.cpp**   | ✔︎        | –          | –      | –           | –                | Root tenant only |

### First-class Saltcorn integration

* Drag-and-drop action builder, workflow nodes and formulas.
* Uses Saltcorn’s interpolation syntax (`{{field_name}}`) for prompts.
* Multi-tenant aware – each tenant may configure its own provider keys.
* Works both in the hosted cloud edition and on-prem installations.

### Safety & observability

* Server-side logging of every completion (log level 6).
* Optional `PLUGIN_DEBUG` constant (auto-disabled on release).
* Type-checked JSON payload construction to avoid API surprises.

---

## Installation

### Marketplace (Saltcorn UI)

1. Log in as **admin** → _Settings_ → _Plugins_.  
2. Search for “`large-language-model`” (choose the **Production City** fork).  
3. Click **Install** → **Enable**.

### Yarn / npm (self-hosted CLI)

# from the Saltcorn project root
yarn add @productioncity/saltcorn-large-language-model
# or: npm install @productioncity/saltcorn-large-language-model

Enable the plug-in via the UI or:

saltcorn install-plugin "@productioncity/saltcorn-large-language-model"

---

## Quick start

1. After enabling, open **Settings → Plug-ins → Large-Language-Model → Configure**.  
2. Select **OpenAI** backend and paste your API key.  
3. Choose a chat model (e.g. `gpt-4o`).  
4. Hit **Save**.  
5. Use the **Test model** button to verify connectivity.

You can now:

* Call `llm_generate("Hello, world!")` from a Formula.  
* Add a **Row saved** action → _LLM Generate_ to enrich data.  
* Train an ML instance with the **LargeLanguageModel** pattern.

---

## Configuration

The settings page is a single-step workflow whose widgets update in real time
to match the selected backend and model.

| Field                       | Description                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| **Backend**                 | One of: OpenAI, OpenAI-compatible, Local Ollama, Local llama.cpp, Google Vertex |
| **Model**                   | Populated from the local registry or remote directories (Ollama / llama.cpp). |
| **API key / Bearer auth**   | Credential field names vary by backend.                                        |
| **Temperature / Top-p**     | Standard sampling controls where supported.                                    |
| **Response format**         | JSON block passed verbatim to OpenAI’s `text.format`.                          |
| **Advanced options**        | Free-form JSON for any parameters not yet modelled by widgets.                 |
| **Alternative configs**     | Only for OpenAI-compatible APIs – define multiple endpoints/models and pick them in actions. |

Google Vertex AI users must complete an OAuth2 flow once; the refresh token is stored in the plug-in configuration.

---

## Runtime functions

All functions are asynchronous and must be awaited in server-side JS or Formulas.

| Function                   | Signature                                                   | Example |
| -------------------------- | ----------------------------------------------------------- | ------- |
| `llm_generate`             | `(prompt, opts={}) → Promise<string \| object>`             | `await llm_generate("Translate to French", {temperature:0.2})` |
| `llm_embedding`            | `(prompt, opts={}) → Promise<array>`                        | `await llm_embedding("Saltcorn")` |
| `llm_generate_image`       | `(prompt, opts={model:"dall-e-3", …}) → Promise<object>`    | `await llm_generate_image("A cute koala", {n:1,size:"1024x1024"})` |

See **src/llmFunctions.js** for the exhaustive JSDoc.

---

## Actions

| Action id            | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `llm_generate`       | Write a text completion back to a row or workflow context. |
| `llm_function_call`  | Use an LLM function-call to insert row(s) into arbitrary tables. |
| `llm_generate_json`  | Legacy structured output generator (unchanged).           |

### LLM function-call ➝ table inserts

1. Configure the prompt, desired function signature and target tables.  
2. The plug-in constructs a JSON-schema that matches the selected columns.  
3. The LLM is instructed to **only** call that function.  
4. Returned arguments are parsed and inserted – including one-to-many relations.

This allows extremely rapid prototyping of data-capture bots without bespoke code.

---

## Model pattern

The **LargeLanguageModel** pattern (Saltcorn ML module) lets you
run inference over table rows:

| Hyper-parameter | Effect |
| --------------- | ------ |
| `temp`          | Overrides temperature. |
| `repeat_penalty`, `ntokens` | llama.cpp-only knobs. |

No training phase – the pattern simply feeds each row into the prompt template and records the output.

---

## Developer guide

### Dev-container

Clone the repo and open in **VS Code**:

git clone https://github.com/productioncity/saltcorn-large-language-model.git
code saltcorn-large-language-model

When the **Dev Container** finishes:

# spin up Saltcorn + Postgres
docker compose -f .devcontainer/docker-compose.yaml up -d

Access Saltcorn at http://localhost:3000 (admin / saltcorn).

### Scripts

* `yarn test` – run the lightweight unit tests.  
* `node scripts/build-models.ts` – refresh `models-openai.json` from your API key.  

### Coding style

* ES2020, CommonJS, Google JS style.  
* Minimal impact policy – see `developer` message in prompts.  
* Australian English spelling in text.

---

## Contributing

Pull requests are welcome!  
Open an issue first if you plan a larger architectural change.

This fork stays reasonably close to upstream; whenever possible submit fixes to
[`saltcorn/large-language-model`](https://github.com/saltcorn/large-language-model) as well.

---

## Licence

Released under the [MIT Licence](LICENCE).  
Copyright © 2023-2025 Saltcorn  
Fork modifications © 2024-2025 [Production City](https://github.com/productioncity)

---