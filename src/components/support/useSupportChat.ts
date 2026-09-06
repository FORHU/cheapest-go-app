'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import {
    initialSupportState,
    supportReducer,
    visibleMessages,
} from './supportReducer';
import type { EscalationDetails } from './EscalationForm';
import type { SupportConversationView, SupportMessageView } from './types';

/**
 * Fetch and EventSource, wired to the reducer that holds the decisions.
 *
 * Nothing here decides anything: the awkward parts — duplicate delivery, the typing
 * indicator, ordering, the reconnect cursor — are in `supportReducer`, where they are
 * tested without a network.
 *
 * The conversation is opened lazily, the first time the panel is opened. Opening one on
 * page load would mint a guest token and a row for every visitor who never asks for help.
 */

export function useSupportChat(isOpen: boolean) {
    const locale = useLocale();
    const [state, dispatch] = useReducer(supportReducer, initialSupportState);
    const [connected, setConnected] = useState(false);
    const [escalating, setEscalating] = useState(false);
    const opening = useRef(false);
    const cursorRef = useRef<string | null>(null);

    cursorRef.current = state.cursor;

    // Open or resume, once, the first time the panel is opened.
    useEffect(() => {
        if (!isOpen || state.conversation || opening.current) return;
        opening.current = true;

        void (async () => {
            try {
                const response = await fetch('/api/support/conversation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locale }),
                });
                if (!response.ok) return;

                const data = (await response.json()) as {
                    conversation: SupportConversationView;
                    messages: SupportMessageView[];
                };
                dispatch({ type: 'opened', conversation: data.conversation, messages: data.messages });
            } catch {
                // Leave the composer disabled; the customer sees "connecting".
            } finally {
                opening.current = false;
            }
        })();
    }, [isOpen, state.conversation, locale]);

    // Live updates. Held only while the panel is open — a stream per visitor per tab, for
    // a panel nobody is looking at, is a connection the server holds for nothing.
    useEffect(() => {
        if (!isOpen || !state.conversation) return;

        // Some webviews and older browsers have no EventSource. Without live updates the
        // widget still works — a message posts over HTTP, and the reply is picked up by
        // the backfill the next time a stream opens — so this degrades rather than breaks.
        if (typeof EventSource === 'undefined') return;

        const since = cursorRef.current;
        const url = since
            ? `/api/support/conversation/stream?since=${encodeURIComponent(since)}`
            : '/api/support/conversation/stream';

        const source = new EventSource(url);

        source.addEventListener('ready', () => setConnected(true));
        source.addEventListener('message', event => {
            try {
                dispatch({
                    type: 'received',
                    message: JSON.parse((event as MessageEvent).data) as SupportMessageView,
                });
            } catch {
                // A frame we cannot read is not worth tearing the stream down for.
            }
        });
        source.onerror = () => setConnected(false);

        return () => {
            source.close();
            setConnected(false);
        };
        // `cursorRef` deliberately not a dependency: the cursor changes on every message,
        // and reconnecting on each one would close the stream that just delivered it.
    }, [isOpen, state.conversation]);

    const send = useCallback((body: string) => {
        const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        dispatch({ type: 'sent', clientId, body, at: new Date().toISOString() });

        void (async () => {
            try {
                const response = await fetch('/api/support/conversation/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ body }),
                });
                if (!response.ok) {
                    dispatch({ type: 'send_failed', clientId });
                    return;
                }

                const data = (await response.json()) as { message: SupportMessageView };
                dispatch({ type: 'confirmed', clientId, message: data.message });
            } catch {
                dispatch({ type: 'send_failed', clientId });
            }
        })();
    }, []);

    /**
     * Ask for a person. Called with no details first; the server answers
     * `identity_required` when a guest has not left any, which is what raises the form.
     */
    const escalate = useCallback(async (details?: EscalationDetails) => {
        setEscalating(true);
        try {
            const response = await fetch('/api/support/conversation/escalate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(details ?? {}),
            });
            const data = (await response.json()) as {
                code?: string;
                conversation?: SupportConversationView;
            };

            if (!response.ok) {
                if (data.code === 'identity_required') dispatch({ type: 'details_required' });
                return;
            }

            if (data.conversation) {
                dispatch({ type: 'escalated', conversation: data.conversation });
            }
        } catch {
            // Nothing changed; the button stays available.
        } finally {
            setEscalating(false);
        }
    }, []);

    const status = state.conversation?.status ?? null;

    return {
        messages: visibleMessages(state),
        conversation: state.conversation,
        isTyping: state.isTyping,
        needsDetails: state.needsDetails,
        escalating,
        // The composer is usable as soon as there is a conversation: a message posts over
        // HTTP whether or not the stream is up, and the reply is backfilled on reconnect.
        canSend: Boolean(state.conversation) && status !== 'resolved',
        connected,
        canEscalate: status === 'ai_active',
        send,
        escalate,
        dismissDetails: useCallback(() => dispatch({ type: 'escalated', conversation: state.conversation! }), [state.conversation]),
    };
}
