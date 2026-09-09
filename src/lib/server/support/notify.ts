/**
 * Telling the team a customer is waiting.
 *
 * A doorbell, not a copy of the conversation. It says who, why and where to go; the
 * transcript stays in the app, where reading it is a deliberate act by someone signed in
 * rather than something sitting in a shared mailbox being forwarded and archived.
 *
 * Nothing here may throw. By the time it runs, the customer has already been told a person
 * is coming — a mail provider outage cannot be allowed to undo that.
 *
 * `notifyEscalation` and `EscalatedConversation` keep their names for now. Escalation is
 * retired vocabulary (ADR-0031) and both are due to be renamed, but `turn.ts` and the
 * escalate route still import them and both of those modules are about to be deleted;
 * renaming here would mean editing files on their way out. `notifyWaitingCustomer` below
 * is the name the new trigger goes by, and is the only entry point anything still calls.
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

/**
 * Take the right to ring for this conversation, or report that it has already rung.
 *
 * One conditional UPDATE, so the decision belongs to Postgres. Reading the row, deciding,
 * and then writing would let a customer who sends two lines a few milliseconds apart —
 * which is the ordinary way people type — produce two doorbells: both requests read
 * `waiting_notified_at IS NULL`, both conclude they are first, and they may not even be on
 * the same instance for anything in this process to notice. `RETURNING` makes the claim
 * and the answer the same statement: exactly one of them updates a row, and only that one
 * gets a conversation back to ring for.
 *
 * The three conditions are the whole of the rule. Waiting and unassigned is what "nobody
 * is coming to this" means; NULL is what "and nobody has been told" means.
 *
 * `getSqlAdmin` is imported here rather than at the top of the file for the same reason
 * `record` does it: `escalationEmail` and `notifyEscalation` are pure enough to be unit
 * tested without a database, and a static import would drag postgres.js into that test.
 */
async function claimWaitingRing(conversationId: string): Promise<EscalatedConversation | null> {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    const sql = getSqlAdmin();
    const rows = await sql<EscalatedConversation[]>`
        UPDATE support_conversations
           SET waiting_notified_at = now()
         WHERE id = ${conversationId}
           AND status = 'waiting_human'
           AND assigned_admin_id IS NULL
           AND waiting_notified_at IS NULL
        RETURNING id,
                  guest_name        AS "guestName",
                  guest_email       AS "guestEmail",
                  source_brand      AS "sourceBrand",
                  escalation_reason AS "escalationReason",
                  user_id           AS "userId"
    `;
    return rows[0] ?? null;
}

/**
 * A customer has written into a conversation nobody is coming to. Tell the team, once.
 *
 * This is the trigger ADR-0031 leaves behind. The doorbell used to ring on Escalation,
 * which was an event and could only happen once; there is no Escalation any more, and a
 * message is not that kind of event — people send three of them for one question. So
 * `waiting_notified_at` records not whether this conversation has ever rung but whether
 * *this waiting spell* has, and both reopen paths clear it so a customer who comes back
 * weeks after being answered rings again.
 *
 * Never throws. It is started without being awaited by the message route, where an
 * escaping rejection would be an unhandled promise rejection in the process serving every
 * other request — and the customer's message is already stored either way.
 */
export async function notifyWaitingCustomer(
    conversationId: string,
    deps: NotifyDeps,
): Promise<void> {
    try {
        if (!deps.address) {
            // Checked before the claim, not after. A deployment that has not said who is
            // on duty has not decided it does not want to know: spending the ring here
            // would mean that the moment SUPPORT_NOTIFY_EMAIL is set, every customer
            // already in the queue stays invisible for the life of their conversation.
            return;
        }

        const claimed = await claimWaitingRing(conversationId);
        if (!claimed) return;

        await notifyEscalation(claimed, deps);
    } catch (err) {
        console.error('[support/notify] could not ring for a waiting customer:', err);
    }
}
