import { describe, it, expect } from 'vitest';
import { initialSupportState, supportReducer, visibleMessages } from './supportReducer';
import type { SupportConversationView, SupportMessageView } from './types';

/**
 * The widget's state, separated from fetch and EventSource so the awkward parts are
 * testable without either.
 *
 * The awkward parts are all about the same thing: the customer's own message arrives back
 * twice. Once as the response to the POST that sent it, and once over the stream, because
 * the stream carries every row written to the conversation and does not know which of
 * them this tab caused. Getting that wrong shows people their own words twice.
 */

const conversation: SupportConversationView = {
    id: 'conv-1',
    status: 'ai_active',
    locale: 'en',
    guestName: null,
    createdAt: '2026-09-06T10:00:00.000Z',
    lastMessageAt: '2026-09-06T10:00:00.000Z',
    escalationNeedsDetails: true,
};

const serverMessage = (over: Partial<SupportMessageView>): SupportMessageView => ({
    id: 'server-1',
    senderType: 'guest',
    body: 'Do you charge a change fee?',
    noticeCode: null,
    createdAt: '2026-09-06T10:00:01.000Z',
    ...over,
});

const opened = supportReducer(initialSupportState, {
    type: 'opened',
    conversation,
    messages: [],
});

describe('supportReducer', () => {
    it('shows a sent message immediately, before the server has confirmed it', () => {
        const state = supportReducer(opened, {
            type: 'sent',
            clientId: 'c1',
            body: 'Do you charge a change fee?',
            at: '2026-09-06T10:00:01.000Z',
        });

        expect(visibleMessages(state).map(m => m.body)).toEqual(['Do you charge a change fee?']);
    });

    it('replaces the optimistic copy when the server confirms it', () => {
        const sent = supportReducer(opened, {
            type: 'sent',
            clientId: 'c1',
            body: 'Do you charge a change fee?',
            at: '2026-09-06T10:00:01.000Z',
        });
        const confirmed = supportReducer(sent, {
            type: 'confirmed',
            clientId: 'c1',
            message: serverMessage({ id: 'server-1' }),
        });

        const visible = visibleMessages(confirmed);
        expect(visible).toHaveLength(1);
        expect(visible[0].id).toBe('server-1');
    });

    it('ignores a streamed message it already has', () => {
        // The stream replays nothing, but a reconnect backfills from a cursor and can
        // overlap with what the POST already returned.
        const withMessage = supportReducer(opened, {
            type: 'received',
            message: serverMessage({ id: 'server-1' }),
        });
        const again = supportReducer(withMessage, {
            type: 'received',
            message: serverMessage({ id: 'server-1' }),
        });

        expect(visibleMessages(again)).toHaveLength(1);
    });

    it('drops the optimistic copy when the stream beats the response to it', () => {
        // The race that shows a customer their own message twice: SSE is often faster
        // than the POST it was caused by.
        const sent = supportReducer(opened, {
            type: 'sent',
            clientId: 'c1',
            body: 'Do you charge a change fee?',
            at: '2026-09-06T10:00:01.000Z',
        });
        const streamed = supportReducer(sent, {
            type: 'received',
            message: serverMessage({ id: 'server-1', body: 'Do you charge a change fee?' }),
        });

        const visible = visibleMessages(streamed);
        expect(visible).toHaveLength(1);
        expect(visible[0].id).toBe('server-1');
    });

    it('starts the typing indicator on send', () => {
        const sent = supportReducer(opened, {
            type: 'sent', clientId: 'c1', body: 'hi', at: '2026-09-06T10:00:01.000Z',
        });

        expect(sent.isTyping).toBe(true);
    });

    it('stops the typing indicator when a reply arrives', () => {
        const sent = supportReducer(opened, {
            type: 'sent', clientId: 'c1', body: 'hi', at: '2026-09-06T10:00:01.000Z',
        });
        const replied = supportReducer(sent, {
            type: 'received',
            message: serverMessage({ id: 'server-2', senderType: 'ai', body: 'Not on flexible fares.' }),
        });

        expect(replied.isTyping).toBe(false);
    });

    it('keeps waiting when the only thing that arrives is the customer\'s own message', () => {
        // The echo of what was just sent is not a reply. Treating it as one stops the
        // indicator the instant it starts, and the customer watches nothing happen.
        const sent = supportReducer(opened, {
            type: 'sent', clientId: 'c1', body: 'hi', at: '2026-09-06T10:00:01.000Z',
        });
        const echoed = supportReducer(sent, {
            type: 'received',
            message: serverMessage({ id: 'server-1', senderType: 'guest', body: 'hi' }),
        });

        expect(echoed.isTyping).toBe(true);
    });

    it('stops waiting when the reply is a notice rather than an answer', () => {
        // A handover writes a system row and no ai row. If only ai rows cleared it, the
        // indicator would spin forever on exactly the conversations that went wrong.
        const sent = supportReducer(opened, {
            type: 'sent', clientId: 'c1', body: 'refund please', at: '2026-09-06T10:00:01.000Z',
        });
        const handed = supportReducer(sent, {
            type: 'received',
            message: serverMessage({
                id: 'server-3', senderType: 'system', noticeCode: 'model_declined', body: 'x',
            }),
        });

        expect(handed.isTyping).toBe(false);
    });

    it('orders messages by when they were created, not when they arrived', () => {
        const late = supportReducer(opened, {
            type: 'received',
            message: serverMessage({ id: 'b', body: 'second', createdAt: '2026-09-06T10:00:05.000Z' }),
        });
        const earlier = supportReducer(late, {
            type: 'received',
            message: serverMessage({ id: 'a', body: 'first', createdAt: '2026-09-06T10:00:02.000Z' }),
        });

        expect(visibleMessages(earlier).map(m => m.body)).toEqual(['first', 'second']);
    });

    it('remembers the newest message it has, so a reconnect can resume from it', () => {
        const state = supportReducer(opened, {
            type: 'received',
            message: serverMessage({ id: 'server-9', createdAt: '2026-09-06T10:00:09.000Z' }),
        });

        expect(state.cursor).toBe('server-9');
    });

    it('does not move the cursor onto an unconfirmed message', () => {
        // Resuming from a client-side id would ask the server for messages after a row it
        // has never heard of, and the backfill would come back empty.
        const sent = supportReducer(opened, {
            type: 'sent', clientId: 'c1', body: 'hi', at: '2026-09-06T10:00:20.000Z',
        });

        expect(sent.cursor).toBeNull();
    });

    it('asks for contact details when escalation says they are needed', () => {
        const state = supportReducer(opened, { type: 'details_required' });

        expect(state.needsDetails).toBe(true);
    });

    it('stops asking once the conversation has been queued', () => {
        const asked = supportReducer(opened, { type: 'details_required' });
        const queued = supportReducer(asked, {
            type: 'escalated',
            conversation: { ...conversation, status: 'waiting_human', escalationNeedsDetails: false },
        });

        expect(queued.needsDetails).toBe(false);
        expect(queued.conversation?.status).toBe('waiting_human');
    });

    it('removes the optimistic copy when the send fails', () => {
        const sent = supportReducer(opened, {
            type: 'sent', clientId: 'c1', body: 'hi', at: '2026-09-06T10:00:01.000Z',
        });
        const failed = supportReducer(sent, { type: 'send_failed', clientId: 'c1' });

        expect(visibleMessages(failed)).toHaveLength(0);
        expect(failed.isTyping).toBe(false);
    });
});
