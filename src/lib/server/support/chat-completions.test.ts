import { describe, it, expect } from 'vitest';
import { toModelReply, toRequestBody, ESCALATE_FUNCTION } from './chat-completions';
import type { ModelRequest } from './model';

/**
 * The adapter between an OpenAI-compatible chat completions API and the responder's port.
 *
 * It holds the only two things worth testing on this side: how a wire response becomes a
 * decision, and what the model is offered. Everything else is a fetch.
 *
 * The translation matters because the responder never sees this shape. A tool call the
 * adapter fails to recognise is a handover the responder never makes, and a hand-over
 * function read as an ordinary tool is a refund question answered by a model.
 */

const request: ModelRequest = {
    messages: [{ role: 'user', content: 'hello' }],
    tools: [
        {
            name: 'get_weather',
            description: 'Current weather for a city.',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
    ],
};

/** A response as the API returns one. */
const response = (message: Record<string, unknown>) => ({
    choices: [{ message, finish_reason: 'stop' }],
});

describe('toModelReply', () => {
    it('reads a plain answer as text', () => {
        expect(toModelReply(response({ role: 'assistant', content: 'No change fee.' })))
            .toEqual({ kind: 'text', text: 'No change fee.' });
    });

    it('reads the hand-over function as an escalation, not as a tool', () => {
        // If this were read as an ordinary tool, the responder would look for a tool of
        // that name, not find one, and hand over for the wrong reason — right outcome,
        // wrong path, and the reason would be lost.
        const reply = toModelReply(response({
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: ESCALATE_FUNCTION, arguments: '{"reason":"refund request"}' },
            }],
        }));

        expect(reply).toEqual({ kind: 'escalate', reason: 'refund request' });
    });

    it('reads an escalation with no stated reason', () => {
        const reply = toModelReply(response({
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: ESCALATE_FUNCTION, arguments: '{}' },
            }],
        }));

        expect(reply).toEqual({ kind: 'escalate', reason: undefined });
    });

    it('reads any other function as a tool call, with its arguments parsed', () => {
        const reply = toModelReply(response({
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"city":"Cebu"}' },
            }],
        }));

        expect(reply).toEqual({ kind: 'tool', name: 'get_weather', args: { city: 'Cebu' } });
    });

    it('takes only the first tool call when the model asks for several at once', () => {
        // The responder runs one tool per iteration and re-asks. Silently dropping the
        // rest is fine; silently running them in an order nobody chose is not.
        const reply = toModelReply(response({
            role: 'assistant',
            content: null,
            tool_calls: [
                { id: 'a', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Cebu"}' } },
                { id: 'b', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Manila"}' } },
            ],
        }));

        expect(reply).toEqual({ kind: 'tool', name: 'get_weather', args: { city: 'Cebu' } });
    });

    it('throws when the model returns neither text nor a tool call', () => {
        // The responder catches this and hands over. Returning empty text instead would
        // put a blank message in the customer's transcript.
        expect(() => toModelReply(response({ role: 'assistant', content: null })))
            .toThrow(/no text and no tool call/i);
        expect(() => toModelReply({ choices: [] })).toThrow(/no choices/i);
    });

    it('throws when tool arguments are not valid JSON', () => {
        expect(() => toModelReply(response({
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'get_weather', arguments: '{city: Cebu' },
            }],
        }))).toThrow(/arguments/i);
    });
});

describe('toRequestBody', () => {
    it('sends the offered tools as functions the model may call', () => {
        const body = toRequestBody(request, 'gpt-4o');
        const names = (body.tools as Array<{ function: { name: string } }>).map(t => t.function.name);

        expect(names).toContain('get_weather');
    });

    it('always offers the hand-over function, even when no tools are offered', () => {
        // A guest gets no tools at all. Without this the model has no way to ask for a
        // person, and its only exit from a question it should not answer is to answer it.
        const body = toRequestBody({ messages: request.messages, tools: [] }, 'gpt-4o');
        const names = (body.tools as Array<{ function: { name: string } }>).map(t => t.function.name);

        expect(names).toEqual([ESCALATE_FUNCTION]);
    });

    it('carries a system prompt ahead of the transcript', () => {
        const body = toRequestBody(request, 'gpt-4o');
        const messages = body.messages as Array<{ role: string; content: string }>;

        expect(messages[0].role).toBe('system');
        expect(messages[1]).toEqual({ role: 'user', content: 'hello' });
    });

    it('names the model it was given', () => {
        expect(toRequestBody(request, 'gpt-4o-mini').model).toBe('gpt-4o-mini');
    });
});
