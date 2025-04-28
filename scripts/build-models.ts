#!/usr/bin/env -S node --experimental-transform-types
/**
 * build-models.ts
 *
 * ▸ Uses /v1/models to discover which engines your API-key can call
 * ▸ Enriches each ID with curated metadata in MODEL_REFERENCE
 * ▸ If an ID ends with -YYYY-MM-DD (or similar) it inherits the base-model’s data
 * ▸ Writes models-openai.json next to the script
 *
 *   $ export OPENAI_API_KEY=sk-…
 *   $ ./build-models.ts
 */

import fetch from 'node-fetch';
import { writeFile } from 'fs/promises';

/* -------------------------------------------------------------------------- */
/* 1.  Types                                                                  */
/* -------------------------------------------------------------------------- */

type TokenInfo = { context: number; output: number; reasoning?: boolean };
type ModFlags = { input: boolean; output: boolean };
type Modalities = { text: ModFlags; image: ModFlags; audio: ModFlags; video: ModFlags };
type Endpoints = Partial<{ chat: string; responses: string; assistants: string; batch: string; fine_tuning: string }>;
type Features = Partial<{
    streaming: boolean;
    funtion_calling: boolean; // (typo preserved to match source)
    structured_data: boolean;
    fine_tuning: boolean;
    distillation: boolean;
    predicted_output: boolean;
}>;

interface ReferenceModel {
    name: string;
    url: string;
    description: string;
    tokens: TokenInfo;
    cutoff: string;
    modalities: Modalities;
    endpoints: Endpoints;
    features: Features;
}

interface OpenAIModelList { data: Array<{ id: string }>; }

/* -------------------------------------------------------------------------- */
/* 2.  Curated reference catalogue                                            */
/*     – Paste/maintain your full object here (truncated for brevity)         */
/* -------------------------------------------------------------------------- */

const MODEL_REFERENCE = {
    "reasoning": [
        {
            "name": "o4-mini",
            "url": "https://platform.openai.com/docs/models/o4-mini",
            "description": "o4-mini is our latest small o-series model. It's optimized for fast, effective reasoning with exceptionally efficient performance in coding and visual tasks.",
            "tokens": {
                "context": 200000,
                "output": 100000,
                "reasoning": true
            },
            "cutoff": "20240601T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "batch": "v1/batch"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true
            }
        },
        {
            "name": "o3",
            "url": "https://platform.openai.com/docs/models/o3",
            "description": "o3 is a well-rounded and powerful model across domains. It sets a new standard for math, science, coding, and visual reasoning tasks. It also excels at technical writing and instruction-following. Use it to think through multi-step problems that involve analysis across text, code, and images.",
            "tokens": {
                "context": 200000,
                "output": 100000,
                "reasoning": true
            },
            "cutoff": "20240601T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "batch": "v1/batch"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true
            }
        },
        {
            "name": "o3-mini",
            "url": "https://platform.openai.com/docs/models/o3-mini",
            "description": "o3-mini is our newest small reasoning model, providing high intelligence at the same cost and latency targets of o1-mini. o3-mini supports key developer features, like Structured Outputs, function calling, and Batch API.",
            "tokens": {
                "context": 200000,
                "output": 100000,
                "reasoning": true
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": false,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "assistants": "v1/assistants",
                "batch": "v1/batch"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true
            }
        },
        {
            "name": "o1",
            "url": "https://platform.openai.com/docs/models/o1",
            "description": "The o1 series of models are trained with reinforcement learning to perform complex reasoning. o1 models think before they answer, producing a long internal chain of thought before responding to the user.",
            "tokens": {
                "context": 200000,
                "output": 100000,
                "reasoning": true
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "assistants": "v1/assistants",
                "batch": "v1/batch"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true
            }
        },
        {
            "name": "o1-mini",
            "url": "https://platform.openai.com/docs/models/o1-mini",
            "description": "The o1 reasoning model is designed to solve hard problems across domains. o1-mini is a faster and more affordable reasoning model, but we recommend using the newer o3-mini model that features higher intelligence at the same latency and price as o1-mini.",
            "tokens": {
                "context": 128000,
                "output": 65536,
                "reasoning": true
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": false,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "assistants": "v1/assistants"
            },
            "features": {
                "streaming": true
            }
        },
        {
            "name": "o1-pro",
            "url": "https://platform.openai.com/docs/models/o1-pro",
            "description": "The o1 series of models are trained with reinforcement learning to think before they answer and perform complex reasoning. The o1-pro model uses more compute to think harder and provide consistently better answers.",
            "tokens": {
                "context": 200000,
                "output": 100000,
                "reasoning": true
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "responses": "v1/responses",
                "batch": "v1/batch"
            },
            "features": {
                "funtion_calling": true,
                "structured_data": true
            }
        }
    ],
    "chat": [
        {
            "name": "gpt-4.1",
            "url": "https://platform.openai.com/docs/models/gpt-4.1",
            "description": "GPT-4.1 is our flagship model for complex tasks. It is well suited for problem solving across domains.",
            "tokens": {
                "context": 1047576,
                "output": 32768
            },
            "cutoff": "20240601T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "assistants": "v1/assistants",
                "batch": "v1/batch",
                "fine_tuning": "v1/fine-tuning"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true,
                "fine_tuning": true,
                "distillation": true,
                "predicted_output": true
            }
        },
        {
            "name": "gpt-4.1-mini",
            "url": "https://platform.openai.com/docs/models/gpt-4.1-mini",
            "description": "GPT-4.1 mini provides a balance between intelligence, speed, and cost that makes it an attractive model for many use cases.",
            "tokens": {
                "context": 1047576,
                "output": 32768
            },
            "cutoff": "20240601T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "assistants": "v1/assistants",
                "batch": "v1/batch",
                "fine_tuning": "v1/fine-tuning"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true,
                "fine_tuning": true
            }
        },
        {
            "name": "gpt-4.1-nano",
            "url": "https://platform.openai.com/docs/models/gpt-4.1-nano",
            "description": "GPT-4.1 mini provides a balance between intelligence, speed, and cost that makes it an attractive model for many use cases.",
            "tokens": {
                "context": 1047576,
                "output": 32768
            },
            "cutoff": "20240601T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "assistants": "v1/assistants",
                "batch": "v1/batch"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true
            }
        },
        {
            "name": "gpt-4o",
            "url": "https://platform.openai.com/docs/models/gpt-4o",
            "description": "GPT-4o (“o” for “omni”) is our versatile, high-intelligence flagship model. It accepts both text and image inputs, and produces text outputs (including Structured Outputs). It is the best model for most tasks, and is our most capable model outside of our o-series models.",
            "tokens": {
                "context": 128000,
                "output": 16384
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "assistants": "v1/assistants",
                "batch": "v1/batch",
                "fine_tuning": "v1/fine-tuning"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true,
                "fine_tuning": true,
                "distillation": true,
                "predicted_output": true
            }
        },
        {
            "name": "gpt-4o-mini",
            "url": "https://platform.openai.com/docs/models/gpt-4o-mini",
            "description": "GPT-4o mini (“o” for “omni”) is a fast, affordable small model for focused tasks. It accepts both text and image inputs, and produces text outputs (including Structured Outputs). It is ideal for fine-tuning, and model outputs from a larger model like GPT-4o can be distilled to GPT-4o-mini to produce similar results at lower cost and latency.",
            "tokens": {
                "context": 128000,
                "output": 16384
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses",
                "assistants": "v1/assistants",
                "batch": "v1/batch",
                "fine_tuning": "v1/fine-tuning"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true,
                "structured_data": true,
                "fine_tuning": true
            }
        },
        {
            "name": "gpt-4o-audio-preview",
            "url": "https://platform.openai.com/docs/models/gpt-4o-audio-preview",
            "description": "This is a preview release of the GPT-4o Audio models. These models accept audio inputs and outputs, and can be used in the Chat Completions REST API.",
            "tokens": {
                "context": 128000,
                "output": 16384
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": false,
                    "output": false
                },
                "audio": {
                    "input": true,
                    "output": true
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true
            }
        },
        {
            "name": "gpt-4o-mini-audio-preview",
            "url": "https://platform.openai.com/docs/models/gpt-4o-mini-audio-preview",
            "description": "This is a preview release of the smaller GPT-4o Audio mini model. It's designed to input audio or create audio outputs via the REST API.",
            "tokens": {
                "context": 128000,
                "output": 16384
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": false,
                    "output": false
                },
                "audio": {
                    "input": true,
                    "output": true
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions"
            },
            "features": {
                "streaming": true,
                "funtion_calling": true
            }
        },
        {
            "name": "chatgpt-4o-latest",
            "url": "https://platform.openai.com/docs/models/chatgpt-4o-latest",
            "description": "ChatGPT-4o points to the GPT-4o snapshot currently used in ChatGPT. GPT-4o is our versatile, high-intelligence flagship model. It accepts both text and image inputs, and produces text outputs. It is the best model for most tasks, and is our most capable model outside of our o-series models.",
            "tokens": {
                "context": 128000,
                "output": 16384
            },
            "cutoff": "20231001T000000+0000",
            "modalities": {
                "text": {
                    "input": true,
                    "output": true
                },
                "image": {
                    "input": true,
                    "output": false
                },
                "audio": {
                    "input": false,
                    "output": false
                },
                "video": {
                    "input": false,
                    "output": false
                }
            },
            "endpoints": {
                "chat": "v1/chat/completions",
                "responses": "v1/responses"
            },
            "features": {
                "streaming": true,
                "predicted_output": true
            }
        }
    ],
} as const satisfies Record<'reasoning' | 'chat', readonly ReferenceModel[]>;

/* Flatten to Map for fast look-ups */
const REF_BY_ID = new Map<string, ReferenceModel>(
    [...MODEL_REFERENCE.reasoning, ...MODEL_REFERENCE.chat].map((m) => [m.name, m]),
);

/* -------------------------------------------------------------------------- */
/* 3.  Helpers                                                                */
/* -------------------------------------------------------------------------- */

/** Return the reference for an ID or its base if it has a -YYYY-MM-DD suffix. */
function lookupRef(id: string): ReferenceModel | undefined {
    if (REF_BY_ID.has(id)) return REF_BY_ID.get(id);

    // step-backwards strategy: chop at the last '-' until a match appears
    let candidate = id;
    while (candidate.includes('-')) {
        candidate = candidate.substring(0, candidate.lastIndexOf('-'));
        const hit = REF_BY_ID.get(candidate);
        if (hit) return hit;
    }
    return undefined;
}

function classifyCategory(id: string, ref?: ReferenceModel): string {
    if (ref) return MODEL_REFERENCE.reasoning.includes(ref) ? 'inference' : 'chat';
    if (id.startsWith('o')) return 'inference';
    if (id.startsWith('gpt-') || id.includes('chatgpt')) return 'chat';
    if (id.includes('embedding')) return 'embedding';
    if (id.startsWith('whisper')) return 'audio';
    if (/(dall-?e|image)/i.test(id)) return 'image';
    return 'completion';
}

function supportedParams(id: string, ref?: ReferenceModel): readonly string[] {
    if (ref && MODEL_REFERENCE.reasoning.includes(ref)) {
        return ['reasoning.effort', 'reasoning.summary', 'tools', 'store'];
    }
    switch (classifyCategory(id, ref)) {
        case 'chat':
            return ['temperature', 'top_p', 'max_output_tokens', 'n', 'stop', 'tools', 'store'];
        case 'completion':
            return ['temperature', 'top_p', 'max_tokens', 'best_of', 'logprobs', 'stop'];
        case 'image':
            return ['n', 'size', 'response_format'];
        case 'audio':
            return ['language', 'response_format', 'temperature'];
        default:
            return [];
    }
}

/* -------------------------------------------------------------------------- */
/* 4.  Builder                                                                */
/* -------------------------------------------------------------------------- */

async function build(): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenAI returned ${res.status} ${res.statusText}`);
    const list: OpenAIModelList = await res.json();

    const models = list.data.map(({ id }) => {
        const ref = lookupRef(id);
        return {
            id,
            category: classifyCategory(id, ref),
            supportedParams: supportedParams(id, ref),
            maxContextTokens: ref?.tokens.context,
            maxOutputTokens: ref?.tokens.output,
            reasoningRequired: ref?.tokens.reasoning ?? false,
            description: ref?.description,
            docsUrl: ref?.url,
            modalities: ref?.modalities,
            endpoints: ref?.endpoints,
            features: ref?.features,
            cutoff: ref?.cutoff,
        };
    });

    await writeFile('models-openai.json', JSON.stringify({ models }, null, 2));
    console.log(`✅  models-openai.json updated (${models.length} models)`); // eslint-disable-line no-console
}

/* -------------------------------------------------------------------------- */
/* 5.  Run                                                                    */
/* -------------------------------------------------------------------------- */
build().catch((err) => {
    console.error(err);
    process.exit(1);
});
