import { env } from '@/utils/env';
import { FROM_NOREPLY, logEmail } from '@/lib/server/email';
import type { GolfBooking } from '@/lib/schemas/golf';

/**
 * Golf Booking emails, one for each status a customer has to hear about. English, like the
 * other booking emails. Never throws: a failed send is recorded in email_logs and the booking
 * carries on.
 */

export type GolfEmailKind = 'requested' | 'confirmed' | 'declined' | 'cancelled';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com').replace(/\/$/, '');

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ENTITIES[c]);

function money(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

/** "Sat 10 Oct 2026, 07:38" on the course's clock. */
function when(iso: string, tz: string | null): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz ?? 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso));
}

function wording(kind: GolfEmailKind, b: GolfBooking): { subject: string; lead: string; note: string } {
    const course = b.courseName;
    switch (kind) {
        case 'requested':
            return {
                subject: `Tee time requested – ${course}`,
                lead: `We've asked ${course} to confirm your tee time.`,
                note: `Your card has been authorised for ${money(b.total, b.currency)} but won't be charged until the course confirms. We'll email you by ${when(b.decideBy ?? b.startsAt, b.timezone)}.`,
            };
        case 'confirmed':
            return {
                subject: `Tee time confirmed – ${course}`,
                lead: `${course} has confirmed your tee time.`,
                note: `We've charged ${money(b.total, b.currency)}. Free cancellation until ${when(b.freeCancelUntil, b.timezone)}.`,
            };
        case 'declined':
            return {
                subject: `We couldn't confirm your tee time – ${course}`,
                lead: b.closeReason === 'not_confirmed_in_time'
                    ? `We couldn't get confirmation from ${course} in time.`
                    : `${course} couldn't take this booking.`,
                note: 'Your card was not charged, and the amount we reserved has been released.',
            };
        case 'cancelled':
            return {
                subject: `Tee time cancelled – ${course}`,
                lead: b.closeReason === 'cancelled_by_team'
                    ? `${course} had to cancel this tee time.`
                    : 'Your tee time has been cancelled.',
                note: b.refundAmount > 0
                    ? `We've refunded ${money(b.refundAmount, b.currency)}. It can take 5–10 business days to appear on your statement.`
                    : 'You were not charged.',
            };
    }
}

export function buildGolfBookingEmail(kind: GolfEmailKind, b: GolfBooking): { subject: string; html: string } {
    const { subject, lead, note } = wording(kind, b);
    const rows: [string, string][] = [
        ['Reference', b.reference],
        ['Course', b.courseName],
        ['Tee time', `${when(b.startsAt, b.timezone)} (course time)`],
        ['Players', String(b.players)],
        ['Lead player', b.leadName],
        ['Green fee', money(b.greenFeeTotal, b.currency)],
        ['Service fee', money(b.serviceFee, b.currency)],
        ['Total', money(b.total, b.currency)],
    ];
    const link = `${SITE_URL}/golf/bookings/${encodeURIComponent(b.reference)}`;
    const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(subject)}</h1>
<p style="margin:0 0 8px;font-size:15px;line-height:1.5">${escapeHtml(lead)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#475569">${escapeHtml(note)}</p>
</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right">${escapeHtml(v)}</td></tr>`).join('\n')}
</table></td></tr>
<tr><td style="padding:24px 28px 28px"><a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">View your booking</a></td></tr>
</table></td></tr></table>
</body></html>`;
    return { subject, html };
}

export async function sendGolfBookingEmail(kind: GolfEmailKind, b: GolfBooking): Promise<void> {
    const emailType = `golf_${kind}` as const;
    try {
        const { subject, html } = buildGolfBookingEmail(kind, b);
        const base = { bookingId: b.reference, recipient: b.contactEmail, subject, emailType };
        const key = env.RESEND_API_KEY;
        if (!key) {
            await logEmail({ ...base, status: 'queued', htmlBody: html });
            return;
        }
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM_NOREPLY, to: [b.contactEmail], subject, html }),
        });
        if (response.ok) {
            await logEmail({ ...base, status: 'sent' });
        } else {
            await logEmail({ ...base, status: 'failed', errorMessage: await response.text(), htmlBody: html });
        }
    } catch (err) {
        console.error(`[golf] ${emailType} email for ${b.reference} failed:`, err);
    }
}
