/**
 * src/configurationWorkflow.js
 *
 * Builds the configuration workflow presented in Saltcorn’s
 * plug-in settings page.  The workflow allows administrators
 * to select a backend (OpenAI, Ollama, Vertex AI, etc.) and to
 * supply the credentials / models required by that backend.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  28 Apr 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                     */
/* -------------------------------------------------------------------------- */

const Workflow = require('@saltcorn/data/models/workflow');
const Form = require('@saltcorn/data/models/form');
const FieldRepeat = require('@saltcorn/data/models/fieldrepeat');
const { domReady } = require('@saltcorn/markup/tags');
const db = require('@saltcorn/data/db');
const { OPENAI_MODELS } = require('../constants.js');

/* -------------------------------------------------------------------------- */
/* Type-definitions (JSDoc)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} PluginConfig
 * @property {string} backend
 * @property {string=} api_key
 * @property {string=} embed_model
 * @property {string=} model
 * @property {string=} client_id
 * @property {string=} client_secret
 * @property {string=} project_id
 * @property {string=} region
 * @property {string=} bearer_auth
 * @property {string=} llama_dir
 * @property {string=} model_path
 * @property {Array<object>=} altconfigs
 */

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Returns TRUE if Saltcorn is running in the root tenant.
 *
 * @returns {boolean}
 */
const isRootTenant = () =>
  db.getTenantSchema() === db.connectObj.default_schema;

/* -------------------------------------------------------------------------- */
/* Workflow builder                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Factory – returns the configuration workflow builder
 * accepted by Saltcorn’s plug-in API.
 *
 * @returns {() => import('@saltcorn/data/models/workflow')}
 */
function createConfigurationWorkflow() {
  return () =>
    new Workflow({
      steps: [
        {
          name: 'API key',
          /**
           * @param {object} _context – unused by this form
           * @returns {Promise<Form>}
           */
          form: async () => {
            /* eslint-disable max-len */
            const backendOptions = [
              'OpenAI',
              'OpenAI-compatible API',
              'Local Ollama',
              ...(isRootTenant() ? ['Local llama.cpp'] : []),
              'Google Vertex AI',
            ];
            /* eslint-enable max-len */

            return new Form({
              additionalHeaders: [
                {
                  headerTag: `<script>
function backendChange(e) {
  const val = e.value;
  const authBtn = document.getElementById('vertex_authorize_btn');
  if (val === 'Google Vertex AI') {
    authBtn.classList.remove('d-none');
  } else {
    authBtn.classList.add('d-none');
  }
}
${domReady(`
  const backend = document.getElementById('inputbackend');
  if (backend) backendChange(backend);
`)}
</script>`,
                },
              ],
              additionalButtons: [
                {
                  label: 'authorize',
                  id: 'vertex_authorize_btn',
                  onclick:
                    "location.href='/large-language-model/vertex/authorize'",
                  class: 'btn btn-primary d-none',
                },
              ],
              fields: [
                {
                  name: 'backend',
                  label: 'Inference backend',
                  type: 'String',
                  required: true,
                  attributes: {
                    options: backendOptions,
                    onChange: 'backendChange(this)',
                  },
                },
                {
                  name: 'client_id',
                  label: 'Client ID',
                  sublabel: 'OAuth2 client ID from your Google Cloud account',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'Google Vertex AI' },
                },
                {
                  name: 'client_secret',
                  label: 'Client Secret',
                  sublabel: 'Client secret from your Google Cloud account',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'Google Vertex AI' },
                },
                {
                  name: 'project_id',
                  label: 'Project ID',
                  sublabel: 'Google Cloud project ID',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'Google Vertex AI' },
                },
                {
                  name: 'model',
                  label: 'Model',
                  type: 'String',
                  showIf: { backend: 'Google Vertex AI' },
                  required: true,
                  attributes: {
                    options: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
                  },
                },
                {
                  name: 'temperature',
                  label: 'Temperature',
                  type: 'Float',
                  sublabel:
                    'Controls the randomness of predictions. Higher values make the output more random.',
                  showIf: { backend: 'Google Vertex AI' },
                  default: 0.7,
                  attributes: { min: 0, max: 1, decimal_places: 1 },
                },
                {
                  name: 'embed_model',
                  label: 'Embedding model',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'Google Vertex AI' },
                  attributes: {
                    options: [
                      'text-embedding-005',
                      'text-embedding-004',
                      'textembedding-gecko@003',
                    ],
                  },
                  default: 'text-embedding-005',
                },
                {
                  name: 'embed_task_type',
                  label: 'Embedding task type',
                  type: 'String',
                  showIf: { backend: 'Google Vertex AI' },
                  attributes: {
                    options: [
                      'RETRIEVAL_QUERY',
                      'RETRIEVAL_DOCUMENT',
                      'SEMANTIC_SIMILARITY',
                      'CLASSIFICATION',
                      'CLUSTERING',
                      'QUESTION_ANSWERING',
                      'FACT_VERIFICATION',
                      'CODE_RETRIEVAL_QUERY',
                    ],
                  },
                  default: 'RETRIEVAL_QUERY',
                },
                {
                  name: 'region',
                  label: 'Region',
                  sublabel: 'Google Cloud region (default: us-central1)',
                  type: 'String',
                  showIf: { backend: 'Google Vertex AI' },
                  default: 'us-central1',
                },
                /* ---------- OpenAI (official) -------------------------------- */
                {
                  name: 'api_key',
                  label: 'API key',
                  sublabel: 'From your OpenAI account',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'OpenAI' },
                },
                {
                  name: 'llama_dir',
                  label: 'llama.cpp directory',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'Local llama.cpp' },
                },
                {
                  name: 'model_path',
                  label: 'Model path',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'Local llama.cpp' },
                },
                {
                  name: 'model',
                  label: 'Model',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'OpenAI' },
                  attributes: { options: OPENAI_MODELS },
                },
                {
                  name: 'embed_model',
                  label: 'Embedding model',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'OpenAI' },
                  attributes: {
                    options: [
                      'text-embedding-3-small',
                      'text-embedding-3-large',
                      'text-embedding-ada-002',
                    ],
                  },
                },
                /* ---------- OpenAI-compatible --------------------------------- */
                {
                  name: 'bearer_auth',
                  label: 'Bearer Auth',
                  sublabel: 'HTTP Header authorisation with bearer token',
                  type: 'String',
                  showIf: { backend: 'OpenAI-compatible API' },
                },
                {
                  name: 'api_key',
                  label: 'API key',
                  type: 'String',
                  showIf: { backend: 'OpenAI-compatible API' },
                },
                {
                  name: 'model',
                  label: 'Model',
                  type: 'String',
                  showIf: { backend: ['OpenAI-compatible API', 'Local Ollama'] },
                },
                {
                  name: 'embed_model',
                  label: 'Embedding model',
                  type: 'String',
                  showIf: { backend: ['OpenAI-compatible API', 'Local Ollama'] },
                },
                {
                  name: 'endpoint',
                  label: 'Chat completions endpoint',
                  type: 'String',
                  sublabel: 'Example: http://127.0.0.1:8080/v1/chat/completions',
                  showIf: { backend: 'OpenAI-compatible API' },
                },
                {
                  name: 'embed_endpoint',
                  label: 'Embedding endpoint',
                  type: 'String',
                  sublabel: 'Example: http://127.0.0.1:8080/v1/embeddings',
                  showIf: { backend: 'OpenAI-compatible API' },
                },
                /* ---------- Ollama-specific ---------------------------------- */
                {
                  name: 'embed_endpoint',
                  label: 'Embedding endpoint',
                  type: 'String',
                  sublabel: 'Optional.  Example: http://localhost:11434/api/embeddings',
                  showIf: { backend: 'Local Ollama' },
                },
                /* ---------- Alternative configs ------------------------------ */
                {
                  input_type: 'section_header',
                  label: 'Alternative configurations',
                  showIf: { backend: 'OpenAI-compatible API' },
                },
                new FieldRepeat({
                  name: 'altconfigs',
                  label: 'Alternative configurations',
                  showIf: { backend: 'OpenAI-compatible API' },
                  fields: [
                    { name: 'name', label: 'Configuration name', type: 'String' },
                    { name: 'model', label: 'Model', type: 'String' },
                    { name: 'endpoint', label: 'Endpoint', type: 'String' },
                    { name: 'bearer_auth', label: 'Bearer Auth', type: 'String' },
                    { name: 'api_key', label: 'API key', type: 'String' },
                  ],
                }),
              ],
            });
          },
        },
      ],
    });
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = createConfigurationWorkflow;