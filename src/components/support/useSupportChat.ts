'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import {
    initialSupportState,
    supportReducer,
    visibleMessages,
} from './supportReducer';
import type { EscalationDetails } from './EscalationForm';
import type { SupportAttachmentView, SupportConversationView, SupportMessageView } from './types';
import type { ReopenOpening } from './reopenTime';

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
    // Panel visibility is state, not just a prop: a reply that lands while the panel is
    // shut is what the launcher badge counts.

    const locale = useLocale();
    const [state, dispatch] = useReducer(supportReducer, initialSupportState);
    const [connected, setConnected] = useState(false);
    const [escalating, setEscalating] = useState(false);
    const opening = useRef(false);
    const cursorRef = useRef<string | null>(null);

    /**
     * Files uploaded and not yet sent.
     *
     * Held here rather than in the reducer because nothing about them is a decision: they
     * are already on the server by the time they reach this list, and the only thing that
     * happens to them is being handed to the next send. The reducer's job is the awkward
     * ordering and de-duplication of messages, and this is neither.
     */
    const [attachments, setAttachments] = useState<SupportAttachmentView[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

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

    // Live updates, held from the moment a conversation exists rather than only while the
    // panel is open. A visitor who never opens support still holds nothing — that was the
    // real point of the original rule — but once they have, closing the panel must not cut
    // the connection, because an arriving reply is exactly what the launcher badge is for.
    useEffect(() => {
        if (!state.conversation) return;

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
    }, [state.conversation]);

    /**
     * Upload one file, now, before any message carries it.
     *
     * The composer shows it immediately after this resolves, which is what lets a customer
     * attach three things and then write the message that goes with them.
     */
    const attach = useCallback(async (file: File) => {
        setUploading(true);
        setUploadError(null);

        try {
            const form = new FormData();
            form.append('file', file);

            const response = await fetch('/api/support/conversation/attachments', {
                method: 'POST',
                body: form,
            });
            const data = (await response.json()) as {
                attachment?: SupportAttachmentView;
                error?: string;
            };

            if (!response.ok || !data.attachment) {
                // The server's words, not ours: it is the only side that knows whether this
                // was the size, the type, or one file too many.
                setUploadError(data.error ?? null);
                return;
            }

            setAttachments(current => [...current, data.attachment as SupportAttachmentView]);
        } catch {
            setUploadError(null);
        } finally {
            setUploading(false);
        }
    }, []);

    /**
     * Drop a file that has not been sent.
     *
     * Removed from the list first so the composer responds immediately, then deleted on the
     * server. A failed delete leaves an unsent file nobody will bind, which the sweep and
     * the bucket's lifecycle rule collect - so it is not worth putting the chip back and
     * asking the customer to care.
     */
    const removeAttachment = useCallback((attachmentId: string) => {
        setAttachments(current => current.filter(a => a.id !== attachmentId));
        setUploadError(null);

        void fetch(`/api/support/conversation/attachments/${attachmentId}`, {
            method: 'DELETE',
        }).catch(() => {});
    }, []);

    const send = useCallback((body: string) => {
        const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const sending = attachments;

        dispatch({ type: 'sent', clientId, body, at: new Date().toISOString(), attachments: sending });
        // Cleared here, not after the POST: the composer must not still be offering files
        // that are on their way into a message, or a second send would try to bind them
        // again and silently carry none.
        setAttachments([]);

        void (async () => {
            try {
                const response = await fetch('/api/support/conversation/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ body, attachmentIds: sending.map(a => a.id) }),
                });
                if (!response.ok) {
                    dispatch({ type: 'send_failed', clientId });
                    // Given back, so the customer can try again without picking the files a
                    // second time. They are still uploaded and still unbound.
                    setAttachments(current => [...sending, ...current]);
                    return;
                }

                const data = (await response.json()) as { message: SupportMessageView };
                dispatch({ type: 'confirmed', clientId, message: data.message });
            } catch {
                dispatch({ type: 'send_failed', clientId });
                setAttachments(current => [...sending, ...current]);
            }
        })();
    }, [attachments]);

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

    // Tell the reducer which side of the glass the customer is on.
    useEffect(() => {
        dispatch({ type: isOpen ? 'opened_panel' : 'closed' });
    }, [isOpen]);

    // When the desk is next open, for a customer who has been queued out of hours. Read
    // from the server rather than stored in the notice, so editing the hours in the desk
    // changes what a waiting customer sees.
    const [nextOpening, setNextOpening] = useState<ReopenOpening | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        void (async () => {
            try {
                const response = await fetch('/api/support/availability');
                if (!response.ok) return;
                const data = (await response.json()) as { nextOpening?: ReopenOpening | null };
                setNextOpening(data.nextOpening ?? null);
            } catch {
                // The panel simply says less.
            }
        })();
    }, [isOpen]);

    const status = state.conversation?.status ?? null;

    return {
        messages: visibleMessages(state),
        conversation: state.conversation,
        attachments,
        uploading,
        uploadError,
        canAttach: Boolean(state.conversation?.attachmentsEnabled) && status !== 'resolved',
        attach,
        removeAttachment,
        nextOpening,
        isTyping: state.isTyping,
        needsDetails: state.needsDetails,
        assistantOffline: state.assistantOffline,
        unread: state.unread,
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
