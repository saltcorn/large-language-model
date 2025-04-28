/**
 * src/configurationWorkflow.js
 *
 * Builds the administrator configuration workflow shown on the plug-in
 * settings page.  The workflow now:
 *   • Dynamically injects parameter widgets based on the selected
 *     OpenAI model’s metadata.
 *   • Displays an info panel (description, token limits, endpoints).
 *   • Provides a “Test model” button for a quick prompt-driven check.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 01 May 2025 – dynamic widgets, validation & test console
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

const Workflow     = require('@saltcorn/data/models/workflow');
const Form         = require('@saltcorn/data/models/form');
const FieldRepeat  = require('@saltcorn/data/models/fieldrepeat');
const { domReady } = require('@saltcorn/markup/tags');
const db           = require('@saltcorn/data/db');

const openaiRegistry = require('./openaiRegistry');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Returns TRUE when running in the root tenant.
 *
 * @returns {boolean}
 */
const isRootTenant = () =>
  db.getTenantSchema() === db.connectObj.default_schema;

/**
 * Build an informative HTML panel for the chosen OpenAI model.
 *
 * @param   {import('./openaiRegistry').unknownParams} meta
 * @returns {string}
 */
function buildInfoPanel(meta) {
  if (!meta) {
    return '<div class="alert alert-danger">Unknown or removed model id.</div>';
  }

  const details = [];
  if (meta.maxContextTokens) {
    details.push(`<li><strong>Context tokens:</strong> ${meta.maxContextTokens}</li>`);
  }
  if (meta.maxOutputTokens) {
    details.push(`<li><strong>Output tokens:</strong> ${meta.maxOutputTokens}</li>`);
  }
  if (meta.endpoints) {
    details.push(
      `<li><strong>Endpoints:</strong> ${Object.keys(meta.endpoints).join(', ')}</li>`,
    );
  }

  return `
    <div class="alert alert-info mb-2">
      <p class="mb-1">${meta.description ?? 'No description provided.'}</p>
      <ul class="mb-0">${details.join('')}</ul>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Workflow builder                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Factory — returns the configuration workflow consumed by Saltcorn.
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
           * Build the single-page form.
           *
           * @param   {object} _ctx
           * @param   {object} cfg     Current plug-in config when editing
           * @returns {Promise<Form>}
           */
          form: async (_ctx, cfg = {}) => {
            /* ------------------------------------------------------------ */
            /* 0.  Common lists & look-ups                                  */
            /* ------------------------------------------------------------ */

            const BACKEND_OPTIONS = [
              'OpenAI',
              'OpenAI-compatible API',
              'Local Ollama',
              ...(isRootTenant() ? ['Local llama.cpp'] : []),
              'Google Vertex AI',
            ];

            /* Pre-compute OpenAI metadata maps for front-end JS */
            const openaiMetaMap = {};
            const openaiInfoMap = {};
            const openaiUnknownMap = {};

            for (const id of openaiRegistry.listModels()) {
              const meta = openaiRegistry.getMeta(id);
              openaiMetaMap[id]    = meta;
              openaiInfoMap[id]    = buildInfoPanel(meta);
              openaiUnknownMap[id] = openaiRegistry.unknownParams(meta);
            }

            /* ------------------------------------------------------------ */
            /* 1.  Dynamic parameter widgets (OpenAI only)                  */
            /* ------------------------------------------------------------ */

            const OPENAI_PARAM_FIELDS = [
              {
                name: 'top_p',
                label: 'Top P',
                type: 'Float',
                attributes: { min: 0, max: 1, step: 0.01 },
                showIf: { backend: 'OpenAI' },
              },
              {
                name: 'max_output_tokens',
                label: 'Max output tokens',
                type: 'Integer',
                attributes: { min: 1 },
                showIf: { backend: 'OpenAI' },
              },
              {
                name: 'n',
                label: 'N (num variations)',
                type: 'Integer',
                attributes: { min: 1, max: 10 },
                showIf: { backend: 'OpenAI' },
              },
              {
                name: 'stop',
                label: 'Stop sequences (comma separated)',
                type: 'String',
                showIf: { backend: 'OpenAI' },
              },
            ];

            /* ------------------------------------------------------------ */
            /* 2.  Build the Form                                           */
            /* ------------------------------------------------------------ */

            return new Form({
              /** Inject helper JS & extra buttons */
              additionalHeaders: [
                {
                  headerTag: `<script>
/* ---------- Registry payloads (injected server-side) ------------------- */
const OPENAI_META     = ${JSON.stringify(openaiMetaMap)};
const OPENAI_INFO     = ${JSON.stringify(openaiInfoMap)};
const OPENAI_UNKNOWN  = ${JSON.stringify(openaiUnknownMap)};

/* ---------- Field change handlers -------------------------------------- */
function backendChange(el) {
  const val = el.value;
  document.getElementById('vertex_authorize_btn').classList.toggle('d-none', val !== 'Google Vertex AI');
  document.getElementById('openai_test_btn').classList.toggle('d-none', val !== 'OpenAI');
}

function modelChange(el) {
  const id    = el.value;
  const panel = document.getElementById('openai_model_info');
  panel.innerHTML = OPENAI_INFO[id] || '<div class="alert alert-danger">Unknown or removed model id.</div>';

  const meta = OPENAI_META[id];
  if (!meta) return;

  /* Update max for output tokens */
  if (meta.maxOutputTokens) {
    const fld = document.getElementById('inputmax_output_tokens');
    if (fld) fld.setAttribute('max', meta.maxOutputTokens);
  }

  /* Toggle rows according to supportedParams */
  const visible = new Set(meta.supportedParams || []);
  ['top_p','max_output_tokens','n','stop','response_format','advanced_options','temperature']
    .forEach((fld) => {
      const row = document.getElementById('scform-row-' + fld);
      if (row) row.classList.toggle('d-none', !visible.has(fld) && !['response_format','advanced_options','temperature'].includes(fld));
    });

  /* Response-format only when /responses exists */
  const hasResponses = !!meta.endpoints?.responses;
  const respRow = document.getElementById('scform-row-response_format');
  if (respRow) respRow.classList.toggle('d-none', !hasResponses);

  /* Advanced options only when unknown params present */
  const hasUnknown = (OPENAI_UNKNOWN[id] || []).length > 0;
  const advRow = document.getElementById('scform-row-advanced_options');
  if (advRow) advRow.classList.toggle('d-none', !hasUnknown);
}

/* ---------- Test-model helper ------------------------------------------ */
function openaiTestModel() {
  const prompt = prompt('Enter a prompt to test the current settings', 'Hello, world!');
  if (!prompt) return;

  const form  = document.getElementById('scform');
  const fd    = new FormData(form);
  fd.append('prompt', prompt);

  fetch('/large-language-model/openai/test', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(j => {
      if (j.ok) {
        alert(JSON.stringify(j.result, null, 2));
      } else {
        alert('Error: ' + j.error);
      }
    })
    .catch(err => alert(err));
}

/* ---------- Initial wiring after DOM ready ----------------------------- */
${domReady(`
  const backendSel = document.getElementById('inputbackend');
  if (backendSel) backendChange(backendSel);

  const modelSel = document.getElementById('inputmodel');
  if (modelSel) modelChange(modelSel);
`)}
</script>`,
                },
              ],
              additionalButtons: [
                {
                  label: 'authorize',
                  id: 'vertex_authorize_btn',
                  onclick: "location.href='/large-language-model/vertex/authorize'",
                  class: 'btn btn-primary d-none',
                },
                {
                  label: 'Test model',
                  id: 'openai_test_btn',
                  onclick: 'openaiTestModel()',
                  class: 'btn btn-secondary d-none',
                },
              ],

              /* ---------------------------------------------------------- */
              /* 3.  Form fields                                           */
              /* ---------------------------------------------------------- */
              fields: [
                /* ---------------- Back-end selector ---------------------- */
                {
                  name: 'backend',
                  label: 'Inference backend',
                  type: 'String',
                  required: true,
                  attributes: {
                    options: BACKEND_OPTIONS,
                    onChange: 'backendChange(this)',
                  },
                },

                /* ======================================================== */
                /* Google Vertex AI  -------------------------------------- */
                /* (unchanged from previous implementation)                */
                /* ======================================================== */
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
                  required: true,
                  showIf: { backend: 'Google Vertex AI' },
                  attributes: {
                    options: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
                  },
                },
                {
                  name: 'temperature',
                  label: 'Temperature',
                  type: 'Float',
                  sublabel: 'Controls the randomness of predictions.',
                  showIf: { backend: ['Google Vertex AI', 'OpenAI'] },
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

                /* ======================================================== */
                /* OpenAI – official API                                    */
                /* ======================================================== */
                {
                  name: 'api_key',
                  label: 'API key',
                  sublabel: 'From your OpenAI account',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'OpenAI' },
                },
                {
                  name: 'model',
                  label: 'Model',
                  type: 'String',
                  required: true,
                  showIf: { backend: 'OpenAI' },
                  attributes: {
                    options: openaiRegistry.listModels(),
                    onChange: 'modelChange(this)',
                  },
                },
                {
                  input_type: 'custom_html',
                  name: 'model_meta',
                  showIf: { backend: 'OpenAI' },
                  html: '<div id="openai_model_info"></div>',
                },

                /* Dynamic parameter widgets */
                ...OPENAI_PARAM_FIELDS,

                {
                  name: 'response_format',
                  label: 'Structured output (JSON)',
                  type: 'String',
                  fieldview: 'textarea',
                  sublabel: 'Must contain at least { format:{ type } }.',
                  showIf: { backend: 'OpenAI' },
                },
                {
                  name: 'advanced_options',
                  label: 'Advanced options (JSON)',
                  type: 'String',
                  fieldview: 'textarea',
                  sublabel: 'Additional parameters that lack widgets.',
                  showIf: { backend: 'OpenAI' },
                },

                /* ======================================================== */
                /* Local llama.cpp                                          */
                /* ======================================================== */
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

                /* ======================================================== */
                /* Local Ollama & OpenAI-compatible                         */
                /* ======================================================== */
                {
                  name: 'bearer_auth',
                  label: 'Bearer auth',
                  sublabel: 'HTTP “Authorization: Bearer …” header',
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
                  sublabel: 'e.g. http://127.0.0.1:8080/v1/chat/completions',
                  showIf: { backend: 'OpenAI-compatible API' },
                },
                {
                  name: 'embed_endpoint',
                  label: 'Embedding endpoint',
                  type: 'String',
                  sublabel: 'e.g. http://127.0.0.1:8080/v1/embeddings',
                  showIf: { backend: 'OpenAI-compatible API' },
                },
                {
                  name: 'embed_endpoint',
                  label: 'Embedding endpoint',
                  type: 'String',
                  sublabel: 'Optional — e.g. http://localhost:11434/api/embeddings',
                  showIf: { backend: 'Local Ollama' },
                },

                /* ======================================================== */
                /* Alternative configs (OpenAI-compatible only)             */
                /* ======================================================== */
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
                    { name: 'name',        label: 'Configuration name', type: 'String' },
                    { name: 'model',       label: 'Model',              type: 'String' },
                    { name: 'endpoint',    label: 'Endpoint',           type: 'String' },
                    { name: 'bearer_auth', label: 'Bearer auth',        type: 'String' },
                    { name: 'api_key',     label: 'API key',            type: 'String' },
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
/* Module exports                                                             */
/* -------------------------------------------------------------------------- */

module.exports = createConfigurationWorkflow;