import type { ModelClient, ModelReply, ModelRequest } from './model';

/**
 * An OpenAI-compatible chat completions adapter for the responder's model port.
 *
 * Everything provider-shaped lives here: function calling, the response envelope, the
 * system prompt. The responder above it reasons in `text | escalate | tool` and never
 * learns what a `tool_call` is.
 *
 * Reuses the same `AI_*` environment the voice assistant reads, so there is one place a
 * key and a model are configured rather than two that can disagree.
 */

/**
 * The function the model calls to ask for a person.
 *
 * A function rather than a magic phrase in the text: a model that says "let me get you a
 * human" in prose has still answered the question itself, and we would be parsing English
 * to find out. Calling this is unambiguous, and the responder treats it as a decision
 * rather than as a tool, so no handler has to exist for it.
 */
export const ESCALATE_FUNCTION = 'escalate_to_human';

const SYSTEM_PROMPT = [
    'You are the customer support assistant for an online travel agency.',
    'Answer questions about bookings, policies, and travel using only what you are told or can look up with the tools you are given.',
    'Never invent a price, a policy, a booking reference, or a confirmation.',
    `Call ${ESCALATE_FUNCTION} instead of answering when the customer asks for a person, when the question is about a refund, a cancellation, a chargeback or a complaint, or when you are not confident the answer is correct.`,
    'If you have no tool for looking up a customer\'s bookings, it is because they are not signed in. Ask them to sign in rather than asking for their email or booking reference.',
    'Keep replies short and plain. No markdown.',
].join(' ');

interface ToolCall {
    function?: { name?: unknown; arguments?: unknown };
}

/**
 * Turn a chat completions response into a decision.
 *
 * Throws rather than guessing. Every throw here is caught by the responder, which writes
 * a notice and hands the conversation to a person — a worse outcome than an answer, and a
 * far better one than a blank message or a tool call built from half-read JSON.
 */
export function toModelReply(response: unknown): ModelReply {
    const choices = (response as { choices?: unknown[] })?.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        throw new Error('Model response had no choices');
    }

    const message = (choices[0] as { message?: Record<string, unknown> }).message ?? {};
    const toolCalls = message.tool_calls;

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        // Only the first. The responder runs one tool then asks again, so the rest would
        // be executed in an order nobody chose against a transcript that has moved on.
        const call = toolCalls[0] as ToolCall;
        const name = call.function?.name;
        if (typeof name !== 'string') {
            throw new Error('Model asked for a function with no name');
        }

        const raw = call.function?.arguments;
        let args: unknown;
        try {
            args = typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {};
        } catch {
            throw new Error(`Model sent unparseable arguments for ${name}`);
        }

        if (name === ESCALATE_FUNCTION) {
            const reason = (args as { reason?: unknown }).reason;
            return { kind: 'escalate', reason: typeof reason === 'string' ? reason : undefined };
        }

        return { kind: 'tool', name, args };
    }

    const content = message.content;
    if (typeof content === 'string' && content.trim()) {
        return { kind: 'text', text: content.trim() };
    }

    throw new Error('Model returned no text and no tool call');
}

/** The request body, including the hand-over function the model always has. */
export function toRequestBody(request: ModelRequest, model: string): Record<string, unknown> {
    const tools = [
        ...request.tools.map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        })),
        {
            type: 'function' as const,
            function: {
                name: ESCALATE_FUNCTION,
                description:
                    'Hand the conversation to a human agent. Use when the customer asks for a person, when the topic is a refund, cancellation or complaint, or when you are not confident in an answer.',
                parameters: {
                    type: 'object',
                    properties: {
                        reason: {
                            type: 'string',
                            description: 'Why you are handing over. Shown to the agent, never to the customer.',
                        },
                    },
                },
            },
        },
    ];

    return {
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...request.messages],
        tools,
        temperature: 0.2,
    };
}

export interface ChatCompletionsConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
    /** Abort a turn that is taking longer than a customer will wait. */
    timeoutMs?: number;
}

export function chatCompletionsConfigFromEnv(): ChatCompletionsConfig {
    return {
        apiKey: process.env.AI_API_KEY || '',
        baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.AI_MODEL || 'gpt-4o',
    };
}

/**
 * The live client. No branches worth testing — the decisions are in `toModelReply`.
 */
export function createChatCompletionsClient(config: ChatCompletionsConfig): ModelClient {
    return {
        async complete(request) {
            if (!config.apiKey) throw new Error('AI_API_KEY is not set');

            const response = await fetch(`${config.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify(toRequestBody(request, config.model)),
                signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
            });

            if (!response.ok) {
                // The body often says which of key, quota or model is wrong.
                const detail = await response.text().catch(() => '');
                throw new Error(`Model call failed: ${response.status} ${detail.slice(0, 200)}`);
            }

            return toModelReply(await response.json());
        },
    };
}
