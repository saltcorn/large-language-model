/**
 * src/generation/googleVertex.js
 *
 * Google Vertex AI completions & embeddings.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

const { VertexAI } = require('@google-cloud/vertexai');
const { PredictionServiceClient, helpers } = require('@google-cloud/aiplatform');

const {
  initOAuth2Client,
  updatePluginTokenCfg,
} = require('./oauth');

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Convert OpenAI-style chat history into Vertex format.
 *
 * @param {Array<object>=} chat
 * @returns {Array<object>}
 */
function convertChatToVertex(chat = []) {
  /** @type {Array<object>} */
  const history = [];
  for (const message of chat) {
    const role = message.role === 'user' ? 'user' : 'model';
    if (message.content) {
      history.push([{ role, parts: [{ text: message.content }] }]);
    } else if (message.tool_calls) {
      const parts = [
        { functionCall: prepFuncArgsFromChat(message.tool_calls[0].function) },
      ];
      history.push([{ role, parts }]);
    }
  }
  return history;
}

/**
 * Transform {arguments:"{…}"} → {args:{…}} required by Vertex.
 *
 * @param {object} fCall
 * @returns {object}
 */
function prepFuncArgsFromChat(fCall) {
  if (!fCall?.arguments) return fCall;
  const copy = JSON.parse(JSON.stringify(fCall));
  copy.args = JSON.parse(copy.arguments);
  delete copy.arguments;
  return copy;
}

/**
 * The reverse of {@link prepFuncArgsFromChat}.
 *
 * @param {object} fCall
 * @returns {object}
 */
function prepFuncArgsForChat(fCall) {
  if (!fCall?.args) return fCall;
  const copy = JSON.parse(JSON.stringify(fCall));
  copy.arguments = JSON.stringify(copy.args);
  delete copy.args;
  return copy;
}

/* -------------------------------------------------------------------------- */
/* Completion                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Generate text via Vertex AI.
 *
 * @param {object} cfg – plug-in config
 * @param {object} opts – generation options
 * @returns {Promise<string|object>}
 */
async function getCompletion(cfg, opts) {
  const oauth2Client = await initOAuth2Client(cfg);

  if (oauth2Client.isTokenExpiring()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await updatePluginTokenCfg(credentials);
  }

  const vertexAI = new VertexAI({
    project: cfg.project_id,
    location: cfg.region ?? 'us-central1',
    googleAuthOptions: { authClient: oauth2Client },
  });

  const generativeModel = vertexAI.getGenerativeModel({
    model: cfg.model,
    systemInstruction: {
      role: 'system',
      parts: [{ text: opts.systemPrompt ?? 'You are a helpful assistant.' }],
    },
    generationCon0fig: { temperature: cfg.temperature ?? 0.7 },
  });

  /** @type {Record<string, unknown>} */
  const chatParams = { history: convertChatToVertex(opts.chat) };

  if (opts.tools?.length) {
    chatParams.tools = [
      {
        functionDeclarations: opts.tools.map((t) =>
          prepFuncArgsForChat(t.function),
        ),
      },
    ];
  }

  const chat = generativeModel.startChat(chatParams);
  const { response } = await chat.sendMessage([{ text: opts.prompt }]);

  const parts = response?.candidates?.[0]?.content?.parts;
  if (!parts) return '';

  if (parts.length === 1 && parts[0].text) {
    return parts[0].text;
  }

  /** @type {Record<string, unknown>} */
  const result = {};
  for (const part of parts) {
    if (part.functionCall) {
      const toolCall = {
        function: prepFuncArgsForChat(part.functionCall),
        id: Math.floor(Math.random() * 1_000_000),
      };
      if (!result.tool_calls) result.tool_calls = [toolCall];
      else result.tool_calls.push(toolCall);
    }
    if (part.text) {
      result.content = result.content ? result.content + part.text : part.text;
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Embedding                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Obtain embeddings from the Vertex embedding model.
 *
 * @param {object} cfg
 * @param {object} opts
 * @returns {Promise<number[]|number[][]>}
 */
async function getEmbedding(cfg, opts) {
  const oauth2Client = await initOAuth2Client(cfg);

  if (oauth2Client.isTokenExpiring()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await updatePluginTokenCfg(credentials);
  }

  const predClient = new PredictionServiceClient({
    apiEndpoint: 'us-central1-aiplatform.googleapis.com',
    authClient: oauth2Client,
  });

  const model = cfg.embed_model ?? 'text-embedding-005';

  /** @type {unknown[]} */
  let instances;
  if (Array.isArray(opts.prompt)) {
    instances = opts.prompt.map((p) =>
      helpers.toValue({
        content: p,
        task_type: cfg.task_type ?? 'RETRIEVAL_QUERY',
      }),
    );
  } else {
    instances = [
      helpers.toValue({
        content: opts.prompt,
        task_type: cfg.task_type ?? 'RETRIEVAL_QUERY',
      }),
    ];
  }

  const [response] = await predClient.predict({
    endpoint: `projects/${cfg.project_id}/locations/${
      cfg.region ?? 'us-central1'
    }/publishers/google/models/${model}`,
    instances,
  });

  const predictions = response.predictions;
  return predictions.map((p) => {
    const embeddingsProto = p.structValue.fields.embeddings;
    const valuesProto = embeddingsProto.structValue.fields.values;
    return valuesProto.listValue.values.map((v) => v.numberValue);
  });
}

module.exports = { getCompletion, getEmbedding };