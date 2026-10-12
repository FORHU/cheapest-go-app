import { deliverEmail } from './deliver';

/**
 * The three emails course-staff onboarding sends: an invitation, and the outcome of a request.
 * English, like the other golf emails. The builders are pure so they can be tested without a
 * mailer; the senders never throw.
 */

const SITE_URL = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com').replace(/\/$/, '');

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ENTITIES[c]);

function layout({ title, paragraphs, cta }: { title: string; paragraphs: string[]; cta?: { label: string; href: string } }): string {
    return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${paragraphs.map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${escapeHtml(p)}</p>`).join('\n')}
${cta ? `<p style="margin:22px 0 0"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(cta.label)}</a></p>` : ''}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

const DAY = 86_400_000;

export function buildInvitationEmail(
    { courseName, link, expiresAt, now = new Date() }: { courseName: string; link: string; expiresAt: Date; now?: Date },
): { subject: string; html: string } {
    const days = Math.max(1, Math.round((expiresAt.getTime() - now.getTime()) / DAY));
    return {
        subject: `You're invited to manage ${courseName} on CheapestGo`,
        html: layout({
            title: `Manage ${courseName} on CheapestGo`,
            paragraphs: [
                `You've been invited to confirm tee-time requests for ${courseName}.`,
                `Sign in or create an account with this email address, then accept the invitation. The link works once and expires in ${days} ${days === 1 ? 'day' : 'days'}.`,
            ],
            cta: { label: 'Accept invitation', href: link },
        }),
    };
}

export function buildRequestDecisionEmail(
    { approved, courseName, note }: { approved: boolean; courseName: string; note: string },
): { subject: string; html: string } {
    const portal = `${SITE_URL()}/course`;
    if (approved) {
        return {
            subject: `You can now manage ${courseName} on CheapestGo`,
            html: layout({
                title: `${courseName} is ready for you`,
                paragraphs: [
                    `Your request was approved. You can now see and confirm tee-time requests for ${courseName}.`,
                    ...(note ? [note] : []),
                ],
                cta: { label: 'Open the course portal', href: portal },
            }),
        };
    }
    return {
        subject: `About your request for ${courseName}`,
        html: layout({
            title: `We couldn't approve your request`,
            paragraphs: [
                `We weren't able to approve your request to manage ${courseName}.`,
                ...(note ? [note] : []),
                'If you think this is a mistake, reply to this email and our team will take another look.',
            ],
        }),
    };
}

export async function sendCourseInvitationEmail(
    { invitationId, to, courseName, token, expiresAt }:
    { invitationId: string; to: string; courseName: string; token: string; expiresAt: Date },
): Promise<void> {
    const link = `${SITE_URL()}/course/join?token=${encodeURIComponent(token)}`;
    const { subject, html } = buildInvitationEmail({ courseName, link, expiresAt });
    await deliverEmail({ emailType: 'golf_course_invitation', referenceId: invitationId, to, subject, html });
}

export async function sendCourseRequestDecisionEmail(
    { requestId, to, approved, courseName, note }:
    { requestId: string; to: string; approved: boolean; courseName: string; note: string },
): Promise<void> {
    const { subject, html } = buildRequestDecisionEmail({ approved, courseName, note });
    await deliverEmail({
        emailType: approved ? 'golf_course_request_approved' : 'golf_course_request_rejected',
        referenceId: requestId, to, subject, html,
    });
}
