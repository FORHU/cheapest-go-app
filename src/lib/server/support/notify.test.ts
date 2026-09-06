import { describe, it, expect, vi } from 'vitest';
import { escalationEmail, notifyEscalation, type NotifyDeps } from './notify';

/**
 * The doorbell.
 *
 * Its whole job is to tell someone a customer is waiting, without becoming a second place
 * the conversation lives. Two things are worth holding still: what it does and does not
 * say, and that it can never take an escalation down with it — the customer has already
 * been promised a person by the time this runs.
 */

const conversation = {
    id: 'conv-1',
    guestName: 'Ana Reyes',
    guestEmail: 'ana@example.com',
    sourceBrand: 'CheapestGo',
    escalationReason: 'refund request',
    userId: null,
};

function deps(over: Partial<NotifyDeps> = {}): NotifyDeps {
    return {
        address: 'support@cheapestgo.com',
        siteUrl: 'https://cheapestgo.com',
        send: vi.fn(async () => {}),
        record: vi.fn(async () => {}),
        ...over,
    };
}

describe('escalationEmail', () => {
    it('says who is waiting, why, and where to go', () => {
        const mail = escalationEmail(conversation, 'https://cheapestgo.com');

        expect(mail.subject).toContain('CheapestGo');
        expect(mail.text).toContain('Ana Reyes');
        expect(mail.text).toContain('refund request');
        expect(mail.text).toContain('https://cheapestgo.com/admin/support');
    });

    it('carries no part of the conversation', () => {
        // The point of a doorbell: the transcript stays in the app, where reading it is a
        // deliberate act by someone signed in, rather than sitting in a shared mailbox
        // that gets forwarded, archived and searched by people who were not looking for it.
        const mail = escalationEmail(
            { ...conversation, escalationReason: 'refund request' },
            'https://cheapestgo.com',
        );

        expect(mail.text).not.toContain('I want a refund');
        expect(mail.text.toLowerCase()).not.toContain('transcript');
    });

    it('copes with a customer who left no name', () => {
        const mail = escalationEmail(
            { ...conversation, guestName: null, guestEmail: null },
            'https://cheapestgo.com',
        );

        expect(mail.subject.length).toBeGreaterThan(0);
        expect(mail.text).not.toContain('null');
    });

    it('says so plainly when the model gave no reason', () => {
        const mail = escalationEmail(
            { ...conversation, escalationReason: null },
            'https://cheapestgo.com',
        );

        expect(mail.text).not.toContain('null');
    });
});

describe('notifyEscalation', () => {
    it('sends to the configured address', async () => {
        const d = deps();

        await notifyEscalation(conversation, d);

        expect(d.send).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'support@cheapestgo.com' }),
        );
    });

    it('sends nothing when no address is configured', async () => {
        // An unset address is a deployment that has not decided who is on duty. Sending
        // to a guessed default would be worse than sending nothing.
        const d = deps({ address: null });

        await notifyEscalation(conversation, d);

        expect(d.send).not.toHaveBeenCalled();
        expect(d.record).not.toHaveBeenCalled();
    });

    it('records that it was sent', async () => {
        const d = deps();

        await notifyEscalation(conversation, d);

        expect(d.record).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'sent', conversationId: 'conv-1' }),
        );
    });

    it('records a failure instead of losing it', async () => {
        const d = deps({ send: vi.fn(async () => { throw new Error('Resend 503'); }) });

        await notifyEscalation(conversation, d);

        expect(d.record).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'failed' }),
        );
    });

    it('never throws, because an escalation must not depend on email', async () => {
        // The customer has already been told a person is coming. A mail provider outage
        // cannot be allowed to undo that, or to crash the process that promised it.
        const d = deps({
            send: vi.fn(async () => { throw new Error('Resend 503'); }),
            record: vi.fn(async () => { throw new Error('database gone too'); }),
        });

        await expect(notifyEscalation(conversation, d)).resolves.toBeUndefined();
    });
});
