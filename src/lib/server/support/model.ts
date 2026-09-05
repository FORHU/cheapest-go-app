/**
 * The narrowest thing the support responder needs from a language model.
 *
 * It exists so the responder's decisions can be tested without a network call or a bill.
 * Everything that varies — which provider, which model, how tools are encoded on the wire
 * — lives behind this in an adapter with no branches worth testing, and the responder
 * above it is exercised against a fake that returns exactly the reply a case needs.
 */

export interface ModelMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ModelRequest {
    messages: ModelMessage[];
}

/**
 * What a turn can come back with.
 *
 * `escalate` is a decision, not a wire format. On the OpenAI side the model asks for a
 * person by calling a function, but the responder should not have to know that — the
 * adapter translates, and this union stays in the language the responder reasons in.
 */
export type ModelReply =
    | { kind: 'text'; text: string }
    | { kind: 'escalate'; reason?: string };

export interface ModelClient {
    complete(request: ModelRequest): Promise<ModelReply>;
}
