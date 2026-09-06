/**
 * Telling the team a customer is waiting.
 *
 * A doorbell, not a copy of the conversation. It says who, why and where to go; the
 * transcript stays in the app, where reading it is a deliberate act by someone signed in
 * rather than something sitting in a shared mailbox being forwarded and archived.
 *
 * Nothing here may throw. By the time it runs, the customer has already been told a person
 * is coming — a mail provider outage cannot be allowed to undo that.
 */

export interface EscalatedConversation {
    id: string;
    guestName: string | null;
    guestEmail: string | null;
    sourceBrand: string | null;
    escalationReason: string | null;
    userId: string | null;
}

export interface EscalationMail {
    subject: string;
    text: string;
}

export interface NotifyRecord {
    conversationId: string;
    recipient: string;
    subject: string;
    status: 'sent' | 'failed';
    error?: string;
}

export interface NotifyDeps {
    /** Where to send. Null when the deployment has not said who is on duty. */
    address: string | null;
    siteUrl: string;
    send(mail: { to: string; subject: string; text: string }): Promise<void>;
    record(entry: NotifyRecord): Promise<void>;
}

/**
 * The live wiring: Resend to send, `email_logs` to remember.
 *
 * Built per call rather than held in a module so an env var changed between requests is
 * read rather than remembered.
 */
export function liveNotifyDeps(): NotifyDeps {
    return {
        address: process.env.SUPPORT_NOTIFY_EMAIL || null,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com',

        async send(mail) {
            const apiKey = process.env.RESEND_API_KEY;
            if (!apiKey) throw new Error('RESEND_API_KEY is not set');

            const { FROM_ALERTS } = await import('@/lib/server/email');
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    from: FROM_ALERTS,
                    to: mail.to,
                    subject: mail.subject,
                    text: mail.text,
                }),
            });

            if (!response.ok) {
                const detail = await response.text().catch(() => '');
                throw new Error(`Resend ${response.status} ${detail.slice(0, 200)}`);
            }
        },

        async record(entry) {
            const { getSqlAdmin } = await import('@/lib/db/postgres');
            const sql = getSqlAdmin();
            // booking_id stays null: a Support Chat is not attached to a booking. The
            // conversation id lives in metadata so the row can still be traced back —
            // which only works if it is stored as an object. `sql.json`, not
            // JSON.stringify: postgres.js encodes a string parameter to JSON again, and
            // `metadata->>'conversationId'` on a JSON string finds nothing.
            await sql`
                INSERT INTO email_logs (recipient, subject, email_type, status, error_message, metadata, sent_at)
                VALUES (
                    ${entry.recipient},
                    ${entry.subject},
                    'support_escalation',
                    ${entry.status},
                    ${entry.error ?? null},
                    ${sql.json({ conversationId: entry.conversationId })},
                    ${entry.status === 'sent' ? new Date() : null}
                )
            `;
        },
    };
}

/** What the email says. Pure, so what it does and does not contain can be held still. */
export function escalationEmail(
    conversation: EscalatedConversation,
    siteUrl: string,
): EscalationMail {
    const brand = conversation.sourceBrand ?? 'CheapestGo';
    const who = conversation.guestName
        ?? (conversation.userId ? 'A signed-in customer' : 'A customer');

    const lines = [
        `${who} is waiting for someone from the team.`,
        '',
        `Brand:  ${brand}`,
    ];

    if (conversation.guestEmail) lines.push(`Email:  ${conversation.guestEmail}`);
    if (conversation.userId) lines.push('Signed in: yes');

    lines.push(
        conversation.escalationReason
            ? `Reason: ${conversation.escalationReason}`
            : 'Reason: not given',
        '',
        `Open it here: ${siteUrl}/admin/support`,
    );

    return {
        subject: `A customer is waiting · ${brand}`,
        text: lines.join('\n'),
    };
}

/**
 * Ring the doorbell, and write down that it rang.
 *
 * The record matters as much as the send: when a customer says nobody answered them for
 * six hours, "was anyone told?" needs an answer, and a log line has long since rotated.
 */
export async function notifyEscalation(
    conversation: EscalatedConversation,
    deps: NotifyDeps,
): Promise<void> {
    if (!deps.address) {
        // Not a failure — a deployment that has not decided who is on duty. Guessing a
        // default address would be worse than staying quiet, and the startup check names
        // this so it is not a silent gap.
        return;
    }

    const mail = escalationEmail(conversation, deps.siteUrl);

    try {
        await deps.send({ to: deps.address, subject: mail.subject, text: mail.text });
        await deps.record({
            conversationId: conversation.id,
            recipient: deps.address,
            subject: mail.subject,
            status: 'sent',
        });
    } catch (err) {
        console.error('[support/notify] escalation email failed:', err);
        try {
            await deps.record({
                conversationId: conversation.id,
                recipient: deps.address,
                subject: mail.subject,
                status: 'failed',
                error: err instanceof Error ? err.message : String(err),
            });
        } catch (recordErr) {
            // Both the mail provider and the database are unavailable. There is nowhere
            // left to write this down, and it still must not reach the caller.
            console.error('[support/notify] could not record the failure either:', recordErr);
        }
    }
}
