const node_fetch = require("node-fetch");
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
const File = require("@saltcorn/data/models/file");
const path = require("path");
const { features, getState } = require("@saltcorn/data/db/state");
const {
  generateText,
  streamText,
  tool,
  jsonSchema,
  embed,
  embedMany,
  experimental_transcribe,
} = require("ai");
const { openai, createOpenAI } = require("@ai-sdk/openai");
let ollamaMod;
if (features.esm_plugins) ollamaMod = require("ollama");

const getEmbedding = async (config, opts) => {
  switch (config.backend) {
    case "AI SDK":
      return await getEmbeddingAISDK(
        {
          provider: config.ai_sdk_provider,
          apiKey: config.api_key,
          embed_model: opts?.embed_model || config.embed_model || config.model,
        },
        opts
      );
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
        const ollama = new Ollama(
          config.ollama_host ? { host: config.ollama_host } : undefined
        );
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

const getImageGeneration = async (config, opts) => {
  switch (config.backend) {
    case "OpenAI":
      return await getImageGenOpenAICompatible(
        {
          imageEndpoint: "https://api.openai.com/v1/images/generations",
          bearer: opts?.api_key || opts?.bearer || config.api_key,
          model: opts?.model || config.model,
          responses_api: config.responses_api,
        },
        opts
      );
    default:
      throw new Error("Image generation not implemented for this backend");
  }
};

const getAudioTranscription = async (
  { backend, apiKey, api_key, model, provider, ai_sdk_provider },
  opts
) => {
  switch (backend) {
    case "AI SDK":
      const api_Key = opts?.api_key || api_key || apiKey;
      const prov_obj = createOpenAI({ apiKey: api_Key });
      const audio =
        opts.url ||
        (Buffer.isBuffer(opts.file)
          ? opts.file
          : typeof opts.file === "string"
          ? await (await File.findOne(opts.file)).get_contents()
          : await opts.file.get_contents());
      const transcript = await experimental_transcribe({
        model: prov_obj.transcription("whisper-1"),
        audio,
      });

      return transcript;
    default:
      throw new Error("Audio transcription not implemented for this backend");
  }
};

const getCompletion = async (config, opts) => {
  switch (config.backend) {
    case "AI SDK":
      return await getCompletionAISDK(
        {
          provider: config.ai_sdk_provider,
          apiKey: config.api_key,
          model: opts?.model || config.model,
        },
        opts
      );
    case "OpenAI":
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: config.responses_api
            ? "https://api.openai.com/v1/responses"
            : "https://api.openai.com/v1/chat/completions",
          bearer: opts?.api_key || opts?.bearer || config.api_key,
          model: opts?.model || config.model,
          responses_api: config.responses_api,
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
      return await getCompletionOpenAICompatible(
        {
          chatCompleteEndpoint: config.ollama_host
            ? path.join(config.ollama_host, "v1/chat/completions")
            : "http://localhost:11434/v1/chat/completions",
          model: opts?.model || config.model,
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

const getAiSdkModel = ({ provider, api_key, model_name }) => {
  switch (provider) {
    case "OpenAI":
      const openai = createOpenAI({ apiKey: api_key });
      return openai(model_name);
    default:
      throw new Error("Provider not found: " + provider);
  }
};

const getCompletionAISDK = async (
  { apiKey, model, provider, temperature },
  {
    systemPrompt,
    prompt,
    debugResult,
    debugCollector,
    chat = [],
    api_key,
    endpoint,
    ...rest
  }
) => {
  const use_model_name = rest.model || model;
  let model_obj = getAiSdkModel({
    model_name: use_model_name,
    api_key: api_key || apiKey,
    provider,
  });
  const modifyChat = (chat) => {
    const f = (c) => {
      if (c.type === "image_url")
        return {
          type: "image",
          image: c.image_url?.url || c.image?.url || c.image_url || c.image,
        };
      else return c;
    };
    return {
      ...chat,
      ...(Array.isArray(chat.content) ? { content: chat.content.map(f) } : {}),
    };
  };
  const newChat = chat.map(modifyChat);

  const body = {
    ...rest,
    model: model_obj,
    messages: [
      {
        role: "system",
        content: systemPrompt || "You are a helpful assistant.",
      },
      ...newChat,
      ...(prompt ? [{ role: "user", content: prompt }] : []),
    ],
  };
  if (rest.temperature || temperature) {
    const str_or_num = rest.temperature || temperature;
    body.temperature = +str_or_num;
  } else if (rest.temperature === null) {
    delete body.temperature;
  } else if (typeof temperature === "undefined") {
    if (
      ![
        "o1",
        "o3",
        "o3-mini",
        "o4-mini",
        "gpt-5",
        "gpt-5-nano",
        "gpt-5-mini",
      ].includes(use_model_name)
    )
      body.temperature = 0.7;
  }
  if (body.tools) {
    const prevTools = [...body.tools];
    body.tools = {};
    prevTools.forEach((t) => {
      body.tools[t.function.name] = tool({
        description: t.function.description,
        inputSchema: jsonSchema(t.function.parameters),
      });
    });
  }

  const debugRequest = { ...body, model: use_model_name };
  if (debugResult)
    console.log("AI SDK request", JSON.stringify(debugRequest, null, 2));
  getState().log(6, `AI SDK request ${JSON.stringify(debugRequest)} `);
  if (debugCollector) debugCollector.request = debugRequest;
  const reqTimeStart = Date.now();

  let results;
  if (rest.streamCallback) {
    delete body.streamCallback;
    results = await streamText(body);
    for await (const textPart of results.textStream) {
      rest.streamCallback(textPart);
    }
  } else results = await generateText(body);
  if (debugResult)
    console.log("AI SDK response", JSON.stringify(results, null, 2));
  else getState().log(6, `AI SDK response ${JSON.stringify(results)}`);
  if (debugCollector) {
    debugCollector.response = results;
    debugCollector.response_time_ms = Date.now() - reqTimeStart;
  }
  const allToolCalls = (await results.steps).flatMap((step) => step.toolCalls);

  if (allToolCalls.length) {
    return {
      tool_calls: allToolCalls,
      content: await results.text,
      messages: (await results.response).messages,
      ai_sdk: true,
    };
  } else return results.text;
};

const getCompletionOpenAICompatible = async (
  { chatCompleteEndpoint, bearer, apiKey, model, responses_api, temperature },
  {
    systemPrompt,
    prompt,
    debugResult,
    debugCollector,
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
  const use_model = rest.model || model;
  const body = {
    //prompt: "How are you?",
    model: use_model,
    ...rest,
  };
  if (rest.temperature || temperature) {
    const str_or_num = rest.temperature || temperature;
    body.temperature = +str_or_num;
  } else if (rest.temperature === null) {
    delete body.temperature;
  } else if (typeof temperature === "undefined") {
    if (
      ![
        "o1",
        "o3",
        "o3-mini",
        "o4-mini",
        "gpt-5",
        "gpt-5-nano",
        "gpt-5-mini",
      ].includes(use_model)
    )
      body.temperature = 0.7;
  }
  if (rest.streamCallback && global.fetch) {
    body.stream = true;
    delete body.streamCallback;
  }
  if (responses_api) {
    for (const tool of body.tools || []) {
      if (tool.type !== "function") continue;
      tool.name = tool.function.name;
      tool.description = tool.function.description;
      tool.parameters = tool.function.parameters;
      if (tool.function.required) tool.required = tool.function.required;
      delete tool.function;
    }
    const newChat = [];
    (chat || []).forEach((c) => {
      if (c.tool_calls) {
        c.tool_calls.forEach((tc) => {
          newChat.push({
            id: tc.id,
            type: "function_call",
            call_id: tc.call_id,
            name: tc.name,
            arguments: tc.arguments,
          });
        });
      } else if (c.content?.image_calls) {
        c.content.image_calls.forEach((ic) => {
          newChat.push({
            ...ic,
            result: undefined,
            filename: undefined,
          });
        });
      } else if (c.content?.mcp_calls) {
        c.content.mcp_calls.forEach((ic) => {
          newChat.push({
            ...ic,
          });
        });
      } else if (c.role === "tool") {
        newChat.push({
          type: "function_call_output",
          call_id: c.call_id,
          output: c.content,
        });
      } else {
        const fcontent = (c) => {
          if (c.type === "image_url")
            return {
              type: "input_image",
              image_url: c.image_url.url,
            };
          else return c;
        };
        newChat.push({
          ...c,
          content: Array.isArray(c.content)
            ? c.content.map(fcontent)
            : c.content,
        });
      }
    });
    body.input = [
      {
        role: "system",
        content: systemPrompt || "You are a helpful assistant.",
      },
      ...newChat,
      ...(prompt ? [{ role: "user", content: prompt }] : []),
    ];
  } else {
    // not response api
    if (body.tools) body.tools = body.tools.filter((t) => t.function);
    body.messages = [
      {
        role: "system",
        content: systemPrompt || "You are a helpful assistant.",
      },
      ...chat,
      ...(prompt ? [{ role: "user", content: prompt }] : []),
    ];
  }
  if (debugResult)
    console.log(
      "OpenAI request",
      JSON.stringify(body, null, 2),
      "to",
      chatCompleteEndpoint,
      "headers",
      JSON.stringify(headers)
    );
  else
    getState().log(
      6,
      `OpenAI request ${JSON.stringify(
        body
      )} to ${chatCompleteEndpoint} headers ${JSON.stringify(headers)}`
    );
  if (debugCollector) debugCollector.request = body;
  const reqTimeStart = Date.now();
  const rawResponse = await (global.fetch || node_fetch)(chatCompleteEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  let streamParts = [];
  let streamToolCalls = null;

  if (rest.streamCallback && body.stream) {
    // https://stackoverflow.com/a/75751803/19839414
    // https://stackoverflow.com/a/57664622/19839414

    let dataDone = false;
    let stashed = "";

    const process_stream_data = (value, resolve) => {
      const arr = value.split("\n");
      arr.forEach((data) => {
        if (data.length === 0) return; // ignore empty message
        if (data.startsWith(":")) return; // ignore sse comment message
        if (data === "data: [DONE]") {
          dataDone = true;
          if (resolve) resolve();
          return;
        }
        try {
          const json = JSON.parse(stashed + data.substring(6));
          stashed = "";
          //console.log(json.choices[0]);

          // callback

          //answer store
          if (json.choices?.[0]?.content)
            streamParts.push(json.choices[0].content);
          if (json.choices?.[0]?.delta?.content)
            streamParts.push(json.choices[0].delta.content);
          if (json.choices?.[0]?.delta?.tool_calls) {
            if (!streamToolCalls) streamToolCalls = json.choices?.[0]?.delta;
            else
              json.choices?.[0]?.delta?.tool_calls.forEach((tc, ix) => {
                streamToolCalls.tool_calls[ix].function.arguments +=
                  tc.function.arguments;
              });
          }
          rest.streamCallback(json);
        } catch (e) {
          //console.error(e);
          stashed = data.substring(6);
        }
      });
    };

    const reader = rawResponse.body
      ?.pipeThrough(new TextDecoderStream())
      .getReader();
    if (!reader) return;
    // eslint-disable-next-line no-constant-condition

    while (!dataDone) {
      // eslint-disable-next-line no-await-in-loop

      const { value, done } = await reader.read();

      if (done) {
        dataDone = true;
        break;
      }
      if (typeof value === "string" && value.startsWith('{\n  "error": {')) {
        throw new Error(value);
      }
      process_stream_data(value);
      if (dataDone) break;
    }

    if (debugCollector) {
      //TODO get the full response
      if (streamToolCalls) debugCollector.response = streamToolCalls;
      debugCollector.response_time_ms = Date.now() - reqTimeStart;
    }
    return streamToolCalls
      ? {
          content: streamParts.join(""),
          tool_calls: streamToolCalls.tool_calls,
        }
      : streamParts.join("");
  }
  const results = await rawResponse.json();
  //console.log("results", results);
  if (debugResult)
    console.log("OpenAI response", JSON.stringify(results, null, 2));
  else getState().log(6, `OpenAI response ${JSON.stringify(results)}`);
  if (debugCollector) {
    debugCollector.response = results;
    debugCollector.response_time_ms = Date.now() - reqTimeStart;
  }

  if (results.error) throw new Error(`OpenAI error: ${results.error.message}`);
  if (responses_api) {
    const textOutput = results.output
      .filter((o) => o.type === "message")
      .map((o) => o.content.map((c) => c.text).join(""))
      .join("");
    return results.output.some(
      (o) =>
        o.type === "function_call" ||
        o.type === "image_generation_call" ||
        o.type === "mcp_list_tools" ||
        o.type === "mcp_call"
    )
      ? {
          tool_calls: emptyToUndefined(
            results.output
              .filter((o) => o.type === "function_call")
              .map((o) => ({
                function: { name: o.name, arguments: o.arguments },
                ...o,
              }))
          ),
          image_calls: emptyToUndefined(
            results.output.filter((o) => o.type === "image_generation_call")
          ),
          mcp_calls: emptyToUndefined(
            results.output.filter(
              (o) => o.type === "mcp_call" || o.type === "mcp_list_tools"
            )
          ),
          content: textOutput || null,
        }
      : textOutput || null;
  } else
    return results?.choices?.[0]?.message?.tool_calls
      ? {
          tool_calls: results?.choices?.[0]?.message?.tool_calls,
          content: results?.choices?.[0]?.message?.content || null,
        }
      : results?.choices?.[0]?.message?.content || null;
};

const emptyToUndefined = (xs) => (xs.length ? xs : undefined);

const getImageGenOpenAICompatible = async (
  config,
  {
    prompt,
    model,
    debugResult,
    debugCollector,
    size,
    quality,
    n,
    output_format,
    response_format,
  }
) => {
  const { imageEndpoint, bearer, apiKey, image_model } = config;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (bearer) headers.Authorization = "Bearer " + bearer;
  if (apiKey) headers["api-key"] = apiKey;
  const body = {
    //prompt: "How are you?",
    model: model || image_model || "gpt-image-1",
    prompt,
    size: size || "1024x1024",
    n: n || 1,
  };
  if (quality) body.quality = quality;
  if (output_format) body.output_format = output_format;
  if (response_format) body.response_format = response_format;
  if (n) body.n = n;
  if (debugResult) console.log("OpenAI image request", imageEndpoint, body);
  if (debugCollector) debugCollector.request = body;

  const rawResponse = await (global.fetch || node_fetch)(imageEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const results = await rawResponse.json();
  if (debugCollector) debugCollector.response = results;
  if (debugResult) console.log("OpenAI image response", results);
  if (results.error) throw new Error(`OpenAI error: ${results.error.message}`);
  return results?.data?.[0];
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
    model: model || embed_model || "text-embedding-3-small",
    input: prompt,
  };

  const rawResponse = await (global.fetch || node_fetch)(embeddingsEndpoint, {
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

const getEmbeddingAISDK = async (config, { prompt, model, debugResult }) => {
  const { provider, apiKey, embed_model } = config;
  let model_obj,
    providerOptions = {};
  const model_name = model || embed_model;

  switch (provider) {
    case "OpenAI":
      const openai = createOpenAI({ apiKey: apiKey });
      model_obj = openai.textEmbeddingModel(
        model_name || "text-embedding-3-small"
      );
      //providerOptions.openai = {};
      break;
  }
  const body = {
    model: model_obj,
    providerOptions,
  };
  if (Array.isArray(prompt)) {
    body.values = prompt;
    const { embeddings } = await embedMany(body);
    return embeddings;
  } else {
    body.value = prompt;
    const { embedding } = await embed(body);
    return embedding;
  }
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
  for (const message of chat || []) {
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
    systemInstruction: {
      role: "system",
      parts: [{ text: opts.systemPrompt || "You are a helpful assistant." }],
    },
    generationCon0fig: {
      temperature: config.temperature || 0.7,
    },
  });
  const chatParams = {
    history: convertChatToVertex(opts.chat),
  };
  if (opts?.tools?.length > 0) {
    chatParams.tools = [
      {
        functionDeclarations: opts.tools.map((t) =>
          prepFuncArgsForChat(t.function)
        ),
      },
    ];
  }
  const chat = generativeModel.startChat(chatParams);
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
          id: Math.floor(Math.random() * 1000000),
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

module.exports = {
  getCompletion,
  getEmbedding,
  getImageGeneration,
  getAudioTranscription,
};
