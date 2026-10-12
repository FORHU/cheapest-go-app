import { env } from '@/utils/env';
import { FROM_NOREPLY, logEmail, type EmailType } from '@/lib/server/email';

/**
 * Sends one transactional golf email through Resend and records the outcome in email_logs.
 * Never throws: a failed send is logged and the caller carries on. Without an API key (local
 * development) the message is logged as queued, with its HTML, instead of sent.
 *
 * `referenceId` is what the log deduplicates on together with the type, so it must be stable for
 * one logical message (a booking reference, an invitation id, a request id).
 */
export async function deliverEmail({ emailType, referenceId, to, subject, html }: {
    emailType: EmailType;
    referenceId: string;
    to: string;
    subject: string;
    html: string;
}): Promise<void> {
    try {
        const base = { bookingId: referenceId, recipient: to, subject, emailType };
        const key = env.RESEND_API_KEY;
        if (!key) {
            await logEmail({ ...base, status: 'queued', htmlBody: html });
            return;
        }
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM_NOREPLY, to: [to], subject, html }),
        });
        if (response.ok) {
            await logEmail({ ...base, status: 'sent' });
        } else {
            await logEmail({ ...base, status: 'failed', errorMessage: await response.text(), htmlBody: html });
        }
    } catch (err) {
        console.error(`[golf] ${emailType} email for ${referenceId} failed:`, err);
    }
}
