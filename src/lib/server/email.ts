import { createAdminClient } from '@/utils/postgres/admin';
import { env } from "@/utils/env";

// ─── Sending addresses ────────────────────────────────────────────────
// Verified domain: mail.cheapestgo.com (Resend, ap-northeast-1)
// Change these two constants if the sending domain ever changes.
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';
const BRAND_EMAIL = process.env.NEXT_PUBLIC_BRAND_EMAIL ?? 'no-reply@mail.cheapestgo.com';
const BRAND_LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO ?? '/Web_Logo_Transparent.png';
const BRAND_LOGO_URL = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cheapestgo.com'}${BRAND_LOGO}`;

export const FROM_NOREPLY = `${BRAND_NAME} <${BRAND_EMAIL}>`;
export const FROM_ALERTS  = `${BRAND_NAME} Alerts <${BRAND_EMAIL}>`;

// ─── Shared email layout helpers ─────────────────────────────────────
function emailOpen(gradient: string, title: string, subtitle: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
    <tr><td style="background:#ffffff;padding:28px 32px;border-radius:16px 16px 0 0;border:1px solid #e2e8f0;border-bottom:none;text-align:center;">
      <img src="${BRAND_LOGO_URL}" alt="${BRAND_NAME}" height="64" style="display:inline-block;height:64px;width:auto;" />
    </td></tr>
    <tr><td style="background:${gradient};padding:28px 32px;text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
      <h1 style="color:white;margin:0;font-size:26px;font-weight:700;">${title}</h1>
      ${subtitle ? `<p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">${subtitle}</p>` : ''}
    </td></tr>
    <tr><td style="background:#ffffff;padding:32px;border:1px solid #e2e8f0;border-top:none;">`;
}

function emailClose(footerNote?: string): string {
    return `    </td></tr>
    <tr><td style="background:#f8fafc;padding:20px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
      <img src="${BRAND_LOGO_URL}" alt="${BRAND_NAME}" height="40" style="display:inline-block;height:40px;width:auto;opacity:0.5;margin-bottom:10px;" />
      <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">${footerNote ?? `This email was sent by ${BRAND_NAME}<br>&copy; ${new Date().getFullYear()} All rights reserved`}</p>
    </td></tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── HTML Escaping (prevent XSS in email templates) ─────────────────

function escapeHtml(str: string | null | undefined): string {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Email Logging ────────────────────────────────────────────────────

export type EmailLogStatus = 'queued' | 'sent' | 'failed';
export type EmailType = 'confirmation' | 'ticketed' | 'refund' | 'cancellation' | 'awaiting_ticket' | 'price_alert';

/**
 * Returns true if an email of this type has already been sent (or queued)
 * for this booking — used to suppress duplicates before calling Resend.
 */
async function isEmailAlreadySent(
     
    supabase: any,
    bookingId: string,
    emailType: EmailType,
): Promise<boolean> {
    const { data } = await supabase
        .from('email_logs')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('email_type', emailType)
        .in('status', ['sent', 'queued'])
        .maybeSingle();
    return data !== null;
}

/**
 * Guard called at the top of every email send function.
 * Returns a resolved { duplicate: true } result if the email was already sent,
 * or null to signal that the caller should proceed with sending.
 *
 * Usage:
 *   const dup = await checkEmailDuplicate(bookingId, 'confirmation');
 *   if (dup) return dup;
 */
async function checkEmailDuplicate(
    bookingId: string | undefined,
    emailType: EmailType,
): Promise<SendBookingEmailResult | null> {
    if (!bookingId) return null;

    const supabase = createAdminClient();
    const alreadySent = await isEmailAlreadySent(supabase, bookingId, emailType);
    if (alreadySent) {
        console.warn(`[email] Duplicate suppressed before send: ${emailType} for booking ${bookingId}`);
        return { success: true }; // treat as success — email was already delivered
    }
    return null;
}

async function logEmail(params: {
    bookingId?: string;
    recipient: string;
    subject: string;
    emailType: EmailType;
    status: EmailLogStatus;
    errorMessage?: string;
    metadata?: Record<string, any>;
    /** Store the rendered HTML so the retry-emails cron can re-send without regenerating. */
    htmlBody?: string;
}): Promise<{ duplicate: boolean }> {
    const supabase = createAdminClient();

    // Deduplication: suppress if a sent/queued record already exists for this booking + type.
    // The unique index on email_logs (booking_id, email_type) WHERE status IN ('sent','queued')
    // acts as a final safety net, but checking first gives a clean log message.
    if (params.bookingId && params.status !== 'failed') {
        const alreadySent = await isEmailAlreadySent(supabase, params.bookingId, params.emailType);
        if (alreadySent) {
            console.warn(`[logEmail] Duplicate suppressed: ${params.emailType} for booking ${params.bookingId}`);
            return { duplicate: true };
        }
    }

    // Merge htmlBody into metadata for failed/queued entries (retry needs it)
    const metadata = {
        ...(params.metadata || {}),
        ...(params.htmlBody ? { htmlBody: params.htmlBody } : {}),
    };

    const { error } = await supabase
        .from('email_logs')
        .insert([{
            booking_id: params.bookingId || null,
            recipient: params.recipient,
            subject: params.subject,
            email_type: params.emailType,
            status: params.status,
            error_message: params.errorMessage ?? null,
            metadata,
            sent_at: params.status === 'sent' ? new Date().toISOString() : null
        }]);

    if (error) {
        // Unique-constraint violation = concurrent duplicate (race was won by the other caller)
        if (error.code === '23505') {
            console.warn(`[logEmail] Unique constraint prevented duplicate: ${params.emailType} for booking ${params.bookingId}`);
            return { duplicate: true };
        }
        console.error('[logEmail] Failed to insert log:', error);
    }

    return { duplicate: false };
}

// ═════════════════════════════════════════════════════════════════════
//  HOTEL BOOKING EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface SendBookingEmailParams {
    bookingId: string;
    dbId?: string; // DB UUID — used for receipt link
    email: string;
    guestName: string;
    hotelName: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    totalPrice: number;
    currency: string;

    // ── Optional enrichment ───────────────────────────────────────────
    // Every field below renders its block only when supplied. This is a
    // transactional record of a payment: omitting a row is always correct,
    // inventing a cancellation deadline or a card number never is.
    /** City or area, for the headline ("You're booked in Makati"). */
    cityName?: string;
    /** Hosted https URL. Email clients will not render app-relative paths. */
    propertyImageUrl?: string;
    propertyAddress?: string;
    /** Deep link for the "Directions" affordance. */
    propertyUrl?: string;
    adults?: number;
    children?: number;
    /** e.g. "breakfast included" — supplier board description. */
    boardDescription?: string;
    checkInTime?: string;
    checkOutTime?: string;
    nights?: number;
    /** Room subtotal before taxes. Renders the breakdown only with taxes present. */
    roomSubtotal?: number;
    taxesAndFees?: number;
    /** Voucher or credit applied, as a positive number. Rendered as a deduction. */
    discountAmount?: number;
    /** e.g. "Visa ending 4417". */
    paymentMethodLabel?: string;
    /** ISO date the card was charged. */
    chargedAt?: string;
    /** Free-cancellation deadline in the property's local time. */
    freeCancellationUntil?: string;
}

export interface SendBookingEmailResult {
    success: boolean;
    error?: string;
}

// ─── Hotel confirmation template ─────────────────────────────────────
//
// Table-based with inline styles throughout, because that is what email
// clients render reliably — Outlook has no flexbox or grid, and Gmail strips
// <style> blocks in some contexts. The one <style> block carries only the
// mobile @media rules, which degrade harmlessly when stripped.

/** Support contact shown in the email. Constants so a change is one edit. */
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@cheapestgo.com';
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? '+63 2 8555 1200';
const COMPANY_ADDRESS = process.env.NEXT_PUBLIC_COMPANY_ADDRESS
    ?? 'CheapestGo Travel Inc., 6795 Ayala Avenue, Makati City 1226, Philippines';

/** "2026-09-04" → "Fri 4 Sep". Falls back to the raw value if unparseable. */
function formatEmailDate(value: string | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatMoney(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency || 'PHP' }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

/**
 * The brand wordmark. CheapestGo's own lockup accents the final "Go"; that is a
 * property of this name, not of the design, so any other brand renders plain
 * rather than having an arbitrary two-character slice tinted.
 */
function brandWordmark(): string {
    const name = escapeHtml(BRAND_NAME);
    if (BRAND_NAME === 'CheapestGo') {
        return `cheapest<span style="color:#60a5fa;">Go</span>`;
    }
    return name;
}

/** A spacer row. Email clients ignore margins, so vertical rhythm is explicit. */
function gap(px: number): string {
    return `<div style="height:${px}px;line-height:${px}px;">&nbsp;</div>`;
}

export function buildHotelConfirmationHtml(p: SendBookingEmailParams): string {
    const siteUrl = env.SITE_URL ?? 'https://cheapestgo.com';
    const manageUrl = `${siteUrl}/trips${p.dbId ? `/${encodeURIComponent(p.dbId)}` : ''}`;

    const headline = p.cityName
        ? `You&rsquo;re booked in ${escapeHtml(p.cityName)}`
        : `Your booking is confirmed`;

    // "Deluxe King · 2 adults · breakfast included" — only the parts we know.
    const guestCount = (p.adults ?? 0) + (p.children ?? 0);
    const roomLine = [
        escapeHtml(p.roomName),
        guestCount > 0 ? `${guestCount} guest${guestCount === 1 ? '' : 's'}` : '',
        p.boardDescription ? escapeHtml(p.boardDescription) : '',
    ].filter(Boolean).join(' &middot; ');

    const priceRow = (label: string, value: string, color = '#0f172a') => `
          <tr>
            <td style="padding:5px 0;color:#64748b;">${label}</td>
            <td align="right" style="padding:5px 0;font-family:'Courier New',Courier,monospace;color:${color};">${value}</td>
          </tr>`;

    // The breakdown appears only when we genuinely have the components. A total
    // on its own is honest; a total with fabricated tax lines is not.
    const breakdown = [
        p.roomSubtotal != null
            ? priceRow(
                p.nights && p.nights > 0
                    ? `1 room &times; ${p.nights} night${p.nights === 1 ? '' : 's'}`
                    : 'Room',
                formatMoney(p.roomSubtotal, p.currency),
            )
            : '',
        p.taxesAndFees != null ? priceRow('Taxes and fees', formatMoney(p.taxesAndFees, p.currency)) : '',
        p.discountAmount ? priceRow(
            `${escapeHtml(BRAND_NAME)} credit`,
            `&minus; ${formatMoney(p.discountAmount, p.currency)}`,
            '#16a34a',
        ) : '',
    ].join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Your booking is confirmed</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .stack { display: block !important; width: 100% !important; }
    .h1 { font-size: 26px !important; line-height: 32px !important; }
    .bigdate { font-size: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<span style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Confirmed &mdash; ${escapeHtml(p.hotelName)}, ${formatEmailDate(p.checkIn)}. Reference ${escapeHtml(p.bookingId)}.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
<tr><td align="center" style="padding:32px 12px 40px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 20px 40px -12px rgba(15,23,42,0.14);">

  <!-- Header band -->
  <tr><td class="px" bgcolor="#0f172a" style="padding:36px 36px 34px 36px;background-color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:17px;font-weight:bold;color:#ffffff;letter-spacing:-0.3px;">${brandWordmark()}</div>
    ${gap(26)}
    <div style="font-size:11px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:#60a5fa;">Confirmed</div>
    ${gap(10)}
    <div class="h1" style="font-size:32px;line-height:38px;font-weight:bold;color:#ffffff;letter-spacing:-1px;">${headline}</div>
    ${gap(12)}
    <div style="font-size:14px;line-height:21px;color:#94a3b8;">Reference <span style="font-family:'Courier New',Courier,monospace;color:#e2e8f0;">${escapeHtml(p.bookingId)}</span> &middot; paid in full</div>
  </td></tr>

  <!-- Stay strip -->
  <tr><td class="px" style="padding:32px 36px 8px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="46%" class="stack" style="width:46%;font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
          <div style="font-size:10px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#94a3b8;">Check in</div>
          ${gap(8)}
          <div class="bigdate" style="font-size:26px;line-height:30px;font-weight:bold;color:#0f172a;letter-spacing:-0.8px;">${formatEmailDate(p.checkIn)}</div>
          ${p.checkInTime ? `${gap(5)}<div style="font-family:'Courier New',Courier,monospace;font-size:13px;color:#64748b;">from ${escapeHtml(p.checkInTime)}</div>` : ''}
        </td>
        <td width="8%" align="center" class="stack" style="width:8%;font-family:Arial,Helvetica,sans-serif;font-size:18px;color:#cbd5e1;vertical-align:middle;padding:14px 0;">&rarr;</td>
        <td width="46%" class="stack" style="width:46%;font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
          <div style="font-size:10px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#94a3b8;">Check out</div>
          ${gap(8)}
          <div class="bigdate" style="font-size:26px;line-height:30px;font-weight:bold;color:#0f172a;letter-spacing:-0.8px;">${formatEmailDate(p.checkOut)}</div>
          ${p.checkOutTime ? `${gap(5)}<div style="font-family:'Courier New',Courier,monospace;font-size:13px;color:#64748b;">by ${escapeHtml(p.checkOutTime)}</div>` : ''}
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td class="px" style="padding:22px 36px 0 36px;"><div style="height:1px;line-height:1px;background-color:#eef2f7;">&nbsp;</div></td></tr>

  <!-- Property -->
  <tr><td class="px" style="padding:22px 36px 0 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        ${p.propertyImageUrl ? `
        <td width="120" class="stack" style="width:120px;padding-right:18px;vertical-align:top;">
          <img src="${escapeHtml(p.propertyImageUrl)}" alt="" width="120" height="96" style="display:block;width:120px;height:96px;border-radius:14px;object-fit:cover;border:0;" />
        </td>` : ''}
        <td class="stack" style="font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
          <div style="font-size:19px;font-weight:bold;color:#0f172a;line-height:24px;letter-spacing:-0.4px;">${escapeHtml(p.hotelName)}</div>
          ${gap(8)}
          <div style="font-size:14px;line-height:21px;color:#64748b;">${roomLine}</div>
          ${p.propertyAddress ? `<div style="font-size:14px;line-height:21px;color:#64748b;">${escapeHtml(p.propertyAddress)}</div>` : ''}
          ${p.propertyUrl ? `${gap(12)}<a href="${escapeHtml(p.propertyUrl)}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Directions &rarr;</a>` : ''}
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td class="px" style="padding:28px 36px 4px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" bgcolor="#2563eb" style="border-radius:14px;">
        <a href="${escapeHtml(manageUrl)}" style="display:block;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px;mso-line-height-rule:exactly;line-height:18px;">Manage my booking</a>
      </td></tr>
    </table>
    ${gap(10)}
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94a3b8;text-align:center;">Change dates, edit guest names, add a request, or download your receipt.</div>
  </td></tr>

  <!-- Payment -->
  <tr><td class="px" style="padding:28px 36px 0 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f8fafc;border-radius:16px;">
      <tr><td style="padding:22px 22px 20px 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
${breakdown}
          <tr>
            <td style="padding:16px 0 0 0;font-size:15px;font-weight:bold;color:#0f172a;">Total paid</td>
            <td align="right" style="padding:16px 0 0 0;font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:bold;color:#0f172a;">${formatMoney(p.totalPrice, p.currency)}</td>
          </tr>
          ${p.paymentMethodLabel || p.chargedAt ? `
          <tr>
            <td colspan="2" style="padding:8px 0 0 0;font-size:12px;line-height:18px;color:#94a3b8;">${[
                p.paymentMethodLabel ? escapeHtml(p.paymentMethodLabel) : '',
                p.chargedAt ? `charged ${formatEmailDate(p.chargedAt)}` : '',
            ].filter(Boolean).join(' &middot; ')}</td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>

  ${p.freeCancellationUntil ? `
  <!-- Cancellation -->
  <tr><td class="px" style="padding:24px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:14px;line-height:22px;color:#475569;"><strong style="color:#0f172a;">Free cancellation until ${escapeHtml(p.freeCancellationUntil)}</strong> (property local time).</div>
  </td></tr>` : ''}

  <!-- Support -->
  <tr><td class="px" style="padding:24px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:14px;line-height:22px;color:#475569;">Need anything? We&rsquo;re here 24/7 at <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#2563eb;text-decoration:none;font-weight:bold;">${escapeHtml(SUPPORT_EMAIL)}</a> or <a href="tel:${escapeHtml(SUPPORT_PHONE.replace(/\s/g, ''))}" style="color:#2563eb;text-decoration:none;font-weight:bold;">${escapeHtml(SUPPORT_PHONE)}</a>.</div>
  </td></tr>

  <!-- Footer -->
  <tr><td class="px" style="padding:28px 36px 30px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;">
    <div style="height:1px;line-height:1px;background-color:#eef2f7;">&nbsp;</div>
    ${gap(20)}
    Transactional message about booking ${escapeHtml(p.bookingId)}.<br>
    ${escapeHtml(COMPANY_ADDRESS)}<br>
    <a href="${siteUrl}/account/notifications" style="color:#64748b;text-decoration:underline;">Email preferences</a>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

export async function sendBookingConfirmationEmail(
    params: SendBookingEmailParams
): Promise<SendBookingEmailResult> {
    const { bookingId, email, guestName, hotelName, roomName, checkIn, checkOut, totalPrice, currency } = params;

    if (!email || !bookingId) {
        return { success: false, error: 'Missing required fields' };
    }

    // Dedup: bail out immediately if this confirmation was already sent/queued
    const dup = await checkEmailDuplicate(bookingId, 'confirmation');
    if (dup) return dup;

    try {

        // Build email HTML from the shared hotel-confirmation template.
        const emailHtml = buildHotelConfirmationHtml(params);


        const supabase = createAdminClient();

        // Store email record in database
        {
            const { error: dbError } = await supabase
                .from('booking_emails')
                .insert([{
                    booking_id: bookingId,
                    recipient_email: email,
                    guest_name: guestName,
                    hotel_name: hotelName,
                    room_name: roomName,
                    check_in: checkIn,
                    check_out: checkOut,
                    total_price: totalPrice,
                    currency: currency,
                    email_html: emailHtml,
                    sent_at: new Date().toISOString(),
                    status: 'queued'
                }]);

            if (dbError) {
                console.error('[sendBookingConfirmationEmail] Failed to store email record:', dbError);
            }
        }

        // Try to send via Resend if API key is available
        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Booking Confirmed - ${hotelName}`;

        if (resendApiKey) {
            try {
                const resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: FROM_NOREPLY,
                        to: [email],
                        subject: subject,
                        html: emailHtml,
                    }),
                });

                if (resendResponse.ok) {
                    await logEmail({
                        bookingId,
                        recipient: email,
                        subject,
                        emailType: 'confirmation',
                        status: 'sent'
                    });
                    return { success: true };
                } else {
                    const errorText = await resendResponse.text();
                    await logEmail({
                        bookingId,
                        recipient: email,
                        subject,
                        emailType: 'confirmation',
                        status: 'failed',
                        errorMessage: errorText,
                        htmlBody: emailHtml,
                    });
                }
            } catch (resendError) {
                console.error('[sendBookingConfirmationEmail] Resend failed:', resendError);
                await logEmail({
                    bookingId,
                    recipient: email,
                    subject,
                    emailType: 'confirmation',
                    status: 'failed',
                    errorMessage: resendError instanceof Error ? resendError.message : 'Unknown error',
                    htmlBody: emailHtml,
                });
            }
        } else {
            // Log as queued if no API key
            await logEmail({
                bookingId,
                recipient: email,
                subject,
                emailType: 'confirmation',
                status: 'queued',
                htmlBody: emailHtml,
            });
            return { success: false, error: 'RESEND_API_KEY not configured' };
        }

        // Resend was available but failed (didn't throw) — already logged above
        return { success: false, error: 'Email sending failed' };
    } catch (error) {
        console.error('[sendBookingConfirmationEmail] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send email',
        };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  HOTEL CANCELLATION EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface SendHotelCancellationEmailParams {
    bookingId: string;
    email: string;
    guestName: string;
    hotelName: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    refundAmount?: number;
    currency?: string;
    refundStatus?: string; // 'processed' | 'pending' | 'non_refundable'
}

export async function sendHotelCancellationEmail(
    params: SendHotelCancellationEmailParams
): Promise<SendBookingEmailResult> {
    const { bookingId, email, guestName, hotelName, roomName, checkIn, checkOut, refundAmount, currency = 'PHP', refundStatus } = params;

    if (!email || !bookingId) {
        return { success: false, error: 'Missing required fields' };
    }

    try {
        const isRefundable = refundStatus !== 'non_refundable' && (refundAmount ?? 0) > 0;
        const formattedRefund = isRefundable
            ? new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(refundAmount!)
            : null;

        const refundBanner = isRefundable
            ? `<div style="background:#f0fdf4;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #22c55e;">
                <p style="margin:0;color:#15803d;font-size:14px;">
                  <strong>Refund of ${formattedRefund} is being processed.</strong><br>
                  Please allow <strong>5–10 business days</strong> for the refund to appear on your statement.
                </p>
              </div>`
            : `<div style="background:#fef2f2;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #ef4444;">
                <p style="margin:0;color:#991b1b;font-size:14px;">
                  <strong>This booking is non-refundable.</strong><br>
                  No refund will be issued per the property's cancellation policy.
                </p>
              </div>`;

        const emailHtml = `${emailOpen('linear-gradient(135deg,#64748b 0%,#475569 100%)', 'Booking Cancelled', escapeHtml(hotelName))}
    <p style="margin:0 0 20px 0;">Dear <strong>${escapeHtml(guestName)}</strong>,</p>
    <p style="margin:0 0 20px 0;">Your reservation at <strong>${escapeHtml(hotelName)}</strong> has been successfully cancelled.</p>

    <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
      <h2 style="margin:0 0 15px 0;font-size:18px;color:#374151;">Cancellation Details</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">Booking ID:</td><td style="padding:8px 0;font-weight:600;font-family:monospace;">${escapeHtml(bookingId)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Property:</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(hotelName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Room:</td><td style="padding:8px 0;">${escapeHtml(roomName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Check-in:</td><td style="padding:8px 0;">${escapeHtml(checkIn)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Check-out:</td><td style="padding:8px 0;">${escapeHtml(checkOut)}</td></tr>
        ${isRefundable ? `<tr style="border-top:1px solid #e5e7eb;"><td style="padding:12px 0 8px 0;color:#6b7280;font-weight:600;">Refund:</td><td style="padding:12px 0 8px 0;font-weight:700;font-size:18px;color:#059669;">${formattedRefund}</td></tr>` : ''}
      </table>
    </div>

    ${refundBanner}

    <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px;">If you have any questions, please contact our support team.</p>
${emailClose()}`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Booking Cancelled - ${hotelName}`;

        if (resendApiKey) {
            try {
                const resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: FROM_NOREPLY,
                        to: [email],
                        subject,
                        html: emailHtml,
                    }),
                });

                if (resendResponse.ok) {
                    await logEmail({ bookingId, recipient: email, subject, emailType: 'cancellation', status: 'sent' });
                    return { success: true };
                }
                const errorText = await resendResponse.text();
                await logEmail({ bookingId, recipient: email, subject, emailType: 'cancellation', status: 'failed', errorMessage: errorText, htmlBody: emailHtml });
                return { success: false, error: `Resend ${resendResponse.status}: ${errorText}` };
            } catch (resendError) {
                console.error('[sendHotelCancellationEmail] Resend failed:', resendError);
                await logEmail({ bookingId, recipient: email, subject, emailType: 'cancellation', status: 'failed', errorMessage: resendError instanceof Error ? resendError.message : 'Unknown error', htmlBody: emailHtml });
                return { success: false, error: resendError instanceof Error ? resendError.message : 'Unknown error' };
            }
        }

        await logEmail({ bookingId, recipient: email, subject, emailType: 'cancellation', status: 'queued', htmlBody: emailHtml });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendHotelCancellationEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  HOTEL AMENDMENT EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface SendHotelAmendmentEmailParams {
    bookingId: string;
    email: string;
    guestName: string;
    hotelName: string;
    changes: string; // e.g. "Guest name, special requests"
}

export async function sendHotelAmendmentEmail(
    params: SendHotelAmendmentEmailParams
): Promise<SendBookingEmailResult> {
    const { bookingId, email, guestName, hotelName, changes } = params;

    if (!email || !bookingId) {
        return { success: false, error: 'Missing required fields' };
    }

    try {
        const emailHtml = `${emailOpen('linear-gradient(135deg,#2563eb 0%,#4f46e5 100%)', 'Booking Updated', escapeHtml(hotelName))}
    <p style="margin:0 0 20px 0;">Dear <strong>${escapeHtml(guestName)}</strong>,</p>
    <p style="margin:0 0 20px 0;">Your booking at <strong>${escapeHtml(hotelName)}</strong> has been updated successfully.</p>

    <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">Booking ID:</td><td style="padding:8px 0;font-weight:600;font-family:monospace;">${escapeHtml(bookingId)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Updated fields:</td><td style="padding:8px 0;">${escapeHtml(changes)}</td></tr>
      </table>
    </div>

    <div style="background:#eef2ff;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #4f46e5;">
      <p style="margin:0;color:#3730a3;font-size:14px;">
        The property has been notified of the changes. If you need further modifications, please contact support.
      </p>
    </div>
${emailClose()}`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Booking Updated - ${hotelName}`;

        if (resendApiKey) {
            try {
                const resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: FROM_NOREPLY,
                        to: [email],
                        subject,
                        html: emailHtml,
                    }),
                });

                if (resendResponse.ok) {
                    await logEmail({ bookingId, recipient: email, subject, emailType: 'confirmation', status: 'sent' });
                    return { success: true };
                }
                const errorText = await resendResponse.text();
                await logEmail({ bookingId, recipient: email, subject, emailType: 'confirmation', status: 'failed', errorMessage: errorText, htmlBody: emailHtml });
                return { success: false, error: `Resend ${resendResponse.status}: ${errorText}` };
            } catch (resendError) {
                console.error('[sendHotelAmendmentEmail] Resend failed:', resendError);
                await logEmail({ bookingId, recipient: email, subject, emailType: 'confirmation', status: 'failed', errorMessage: resendError instanceof Error ? resendError.message : 'Unknown error', htmlBody: emailHtml });
                return { success: false, error: resendError instanceof Error ? resendError.message : 'Unknown error' };
            }
        }

        await logEmail({ bookingId, recipient: email, subject, emailType: 'confirmation', status: 'queued', htmlBody: emailHtml });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendHotelAmendmentEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  FLIGHT BOOKING EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface FlightSegmentEmail {
    airline: string;
    airlineName?: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
}

export interface SendFlightBookingEmailParams {
    bookingId: string;
    pnr: string;
    email: string;
    passengerName: string;
    provider: string;
    segments: FlightSegmentEmail[];
    tickets?: { name: string; number: string }[];
    totalPrice: number;
    currency: string;
}

export interface SendFlightBookingEmailResult {
    success: boolean;
    error?: string;
}

export async function sendFlightBookingConfirmationEmail(
    params: SendFlightBookingEmailParams
): Promise<SendFlightBookingEmailResult> {
    const { bookingId, pnr, email, passengerName, provider, segments, tickets, totalPrice, currency } = params;
    const flightReceiptUrl = `${env.SITE_URL}/trips/invoice/${bookingId}?type=flight`;

    if (!email || !bookingId) {
        return { success: false, error: 'Missing required fields' };
    }

    // Dedup: bail out immediately if this confirmation was already sent/queued
    const dup = await checkEmailDuplicate(bookingId, 'confirmation');
    if (dup) return dup;

    try {
        const formattedPrice = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD',
        }).format(totalPrice);

        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const route = firstSeg && lastSeg
            ? `${firstSeg.origin} → ${lastSeg.destination}`
            : 'N/A';

        // Build segment rows for email
        const segmentRows = segments.map((seg) => {
            const depDate = new Date(seg.departureTime);
            const arrDate = new Date(seg.arrivalTime);
            const depStr = depDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
            const arrStr = arrDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

            return `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                        <strong>${escapeHtml(seg.airlineName || seg.airline)}</strong><br>
                        <span style="color: #6b7280; font-size: 13px;">${escapeHtml(seg.flightNumber)}</span>
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                        <strong>${escapeHtml(seg.origin)}</strong><br>
                        <span style="color: #6b7280; font-size: 13px;">${escapeHtml(depStr)}</span>
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #9ca3af;">→</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                        <strong>${escapeHtml(seg.destination)}</strong><br>
                        <span style="color: #6b7280; font-size: 13px;">${escapeHtml(arrStr)}</span>
                    </td>
                </tr>`;
        }).join('');

        const emailHtml = `${emailOpen('linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)', 'Flight Booking Confirmed!', escapeHtml(route))}
        <p style="margin: 0 0 20px 0;">Dear <strong>${escapeHtml(passengerName)}</strong>,</p>

        <p style="margin: 0 0 20px 0;">Your flight has been booked successfully. Here are your booking details:</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #374151;">Booking Details</h2>

            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">PNR:</td>
                    <td style="padding: 8px 0; font-weight: 700; font-family: monospace; font-size: 18px; color: #4f46e5;">${escapeHtml(pnr)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Booking ID:</td>
                    <td style="padding: 8px 0; font-weight: 600; font-family: monospace;">${escapeHtml(bookingId)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
                    <td style="padding: 8px 0; text-transform: capitalize;">${escapeHtml(provider)}</td>
                </tr>
                ${tickets && tickets.length > 0 ? `
                <tr style="border-top: 1px solid #e5e7eb;">
                    <td style="padding: 12px 0 8px 0; color: #6b7280; font-weight: 600; vertical-align: top;">E-Tickets:</td>
                    <td style="padding: 12px 0 8px 0;">
                        ${tickets.map(t => `<div style="margin-bottom: 4px"><span style="color:#4f46e5;font-weight:600;font-family:monospace;">${escapeHtml(t.number)}</span> <span style="font-size:12px;color:#6b7280;">- ${escapeHtml(t.name)}</span></div>`).join('')}
                    </td>
                </tr>
                ` : ''}
                <tr style="border-top: 1px solid #e5e7eb;">
                    <td style="padding: 12px 0 8px 0; color: #6b7280; font-weight: 600;">Total Paid:</td>
                    <td style="padding: 12px 0 8px 0; font-weight: 700; font-size: 18px; color: #059669;">${formattedPrice}</td>
                </tr>
            </table>
        </div>

        <div style="margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #374151;">Flight Itinerary</h3>
            <table style="width: 100%; border-collapse: collapse;">
                ${segmentRows}
            </table>
        </div>

        <div style="background: #eef2ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5;">
            <p style="margin: 0; color: #3730a3; font-size: 14px;">
                <strong>Important:</strong><br>
                Please save your PNR (<strong>${escapeHtml(pnr)}</strong>) for check-in and reference.
                Arrive at the airport at least 2 hours before domestic flights or 3 hours before international flights.
            </p>
        </div>

        <div style="text-align: center; margin: 24px 0 8px 0;">
            <a href="${flightReceiptUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;">
                View / Download Receipt
            </a>
        </div>

        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px;">
            If you have any questions, please don't hesitate to contact us.
        </p>
${emailClose()}`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Flight Booking Confirmed - PNR ${pnr} (${route})`;
        console.log('[sendFlightBookingConfirmationEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const payload = {
                from: FROM_NOREPLY,
                to: [email],
                subject: subject,
                html: emailHtml,
            };

            const resendResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const responseText = await resendResponse.text();

            if (resendResponse.ok) {
                await logEmail({
                    bookingId,
                    recipient: email,
                    subject,
                    emailType: 'confirmation',
                    status: 'sent'
                });
                return { success: true };
            }

            await logEmail({
                bookingId,
                recipient: email,
                subject,
                emailType: 'confirmation',
                status: 'failed',
                errorMessage: responseText,
                htmlBody: emailHtml,
            });
            return { success: false, error: `Resend ${resendResponse.status}: ${responseText}` };
        }

        await logEmail({
            bookingId,
            recipient: email,
            subject,
            emailType: 'confirmation',
            status: 'queued',
            htmlBody: emailHtml,
        });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendFlightBookingConfirmationEmail] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send email',
        };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  FLIGHT AWAITING TICKET EMAIL  (Email 1 for pending Mystifly bookings)
// ═════════════════════════════════════════════════════════════════════

export interface SendFlightAwaitingTicketEmailParams {
    bookingId: string;
    pnr: string;
    email: string;
    passengerName: string;
    segments: FlightSegmentEmail[];
    totalPrice: number;
    currency: string;
}

export async function sendFlightAwaitingTicketEmail(
    params: SendFlightAwaitingTicketEmailParams,
): Promise<SendFlightBookingEmailResult> {
    const { bookingId, pnr, email, passengerName, segments, totalPrice, currency } = params;
    if (!email || !bookingId) return { success: false, error: 'Missing required fields' };

    try {
        const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(totalPrice);
        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const route = firstSeg && lastSeg ? `${firstSeg.origin} → ${lastSeg.destination}` : 'N/A';

        const segmentRows = segments.map((seg) => {
            const depStr = new Date(seg.departureTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
            const arrStr = new Date(seg.arrivalTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
            return `
            <tr>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(seg.airlineName || seg.airline)}</strong><br><span style="color:#6b7280;font-size:13px;">${escapeHtml(seg.flightNumber)}</span></td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(seg.origin)}</strong><br><span style="color:#6b7280;font-size:13px;">${escapeHtml(depStr)}</span></td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#9ca3af;">→</td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(seg.destination)}</strong><br><span style="color:#6b7280;font-size:13px;">${escapeHtml(arrStr)}</span></td>
            </tr>`;
        }).join('');

        const emailHtml = `${emailOpen('linear-gradient(135deg,#d97706 0%,#b45309 100%)', 'Booking Confirmed', `E-Ticket Pending — ${escapeHtml(route)}`)}
        <p style="margin:0 0 20px 0;">Dear <strong>${escapeHtml(passengerName)}</strong>,</p>
        <p style="margin:0 0 20px 0;">Your seat is reserved and your payment of <strong>${formattedPrice}</strong> has been captured. The airline is currently processing your e-ticket — this usually takes a few minutes to a few hours.</p>
        <p style="margin:0 0 20px 0;">We'll send you another email as soon as your e-ticket number is issued. No action is needed from you.</p>

        <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
            <h2 style="margin:0 0 15px 0;font-size:18px;color:#374151;">Booking Reference</h2>
            <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#6b7280;">PNR:</td><td style="padding:8px 0;font-weight:700;font-family:monospace;font-size:18px;color:#d97706;">${escapeHtml(pnr)}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;">Booking ID:</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${escapeHtml(bookingId)}</td></tr>
                <tr style="border-top:1px solid #e5e7eb;"><td style="padding:12px 0 8px 0;color:#6b7280;font-weight:600;">Total Charged:</td><td style="padding:12px 0 8px 0;font-weight:700;font-size:18px;color:#059669;">${formattedPrice}</td></tr>
            </table>
        </div>

        <div style="margin:20px 0;">
            <h3 style="margin:0 0 10px 0;font-size:16px;color:#374151;">Flight Itinerary</h3>
            <table style="width:100%;border-collapse:collapse;">${segmentRows}</table>
        </div>

        <div style="background:#fffbeb;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #d97706;">
            <p style="margin:0;color:#92400e;font-size:14px;">
                <strong>What happens next?</strong><br>
                Your PNR (<strong>${escapeHtml(pnr)}</strong>) is your booking reference. The airline is finalizing ticketing. You'll receive a second email with your e-ticket number once it's issued. If ticketing fails for any reason, you will be fully refunded automatically.
            </p>
        </div>
${emailClose()}`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Booking Received – PNR ${pnr} (${route}) — E-Ticket Pending`;
        console.log('[sendFlightAwaitingTicketEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: FROM_NOREPLY,
                    to: [email],
                    subject,
                    html: emailHtml,
                }),
            });
            const text = await res.text();
            if (res.ok) {
                await logEmail({
                    bookingId,
                    recipient: email,
                    subject,
                    emailType: 'awaiting_ticket',
                    status: 'sent'
                });
                return { success: true };
            }
            await logEmail({
                bookingId,
                recipient: email,
                subject,
                emailType: 'awaiting_ticket',
                status: 'failed',
                errorMessage: text,
                htmlBody: emailHtml,
            });
            return { success: false, error: `Resend ${res.status}: ${text}` };
        }

        await logEmail({
            bookingId,
            recipient: email,
            subject,
            emailType: 'awaiting_ticket',
            status: 'queued',
            htmlBody: emailHtml,
        });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendFlightAwaitingTicketEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  FLIGHT REFUND EMAIL  (Email 2B — ticketing failed, refund initiated)
// ═════════════════════════════════════════════════════════════════════

export interface SendFlightRefundEmailParams {
    bookingId: string;
    pnr: string;
    email: string;
    passengerName: string;
    segments: FlightSegmentEmail[];
    totalPrice: number;
    currency: string;
    /** Stripe refund ID if available */
    refundId?: string;
}

export async function sendFlightRefundEmail(
    params: SendFlightRefundEmailParams,
): Promise<SendFlightBookingEmailResult> {
    const { bookingId, pnr, email, passengerName, segments, totalPrice, currency, refundId } = params;
    if (!email || !bookingId) return { success: false, error: 'Missing required fields' };

    try {
        const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(totalPrice);
        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const route = firstSeg && lastSeg ? `${firstSeg.origin} → ${lastSeg.destination}` : 'N/A';

        const emailHtml = `${emailOpen('linear-gradient(135deg,#475569 0%,#334155 100%)', 'Booking Update', `Refund Initiated — ${escapeHtml(route)}`)}
        <p style="margin:0 0 20px 0;">Dear <strong>${escapeHtml(passengerName)}</strong>,</p>
        <p style="margin:0 0 20px 0;">We're sorry to inform you that the airline was unable to confirm the e-ticket for your booking <strong>${escapeHtml(pnr)}</strong> (${escapeHtml(route)}). This can happen occasionally due to seat availability changes after reservation.</p>
        <p style="margin:0 0 20px 0;">A <strong>full refund of ${formattedPrice}</strong> has been initiated to your original payment method.</p>

        <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
            <h2 style="margin:0 0 15px 0;font-size:18px;color:#374151;">Refund Details</h2>
            <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#6b7280;">PNR:</td><td style="padding:8px 0;font-weight:700;font-family:monospace;">${escapeHtml(pnr)}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;">Booking ID:</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${escapeHtml(bookingId)}</td></tr>
                ${refundId ? `<tr><td style="padding:8px 0;color:#6b7280;">Refund ID:</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${escapeHtml(refundId)}</td></tr>` : ''}
                <tr style="border-top:1px solid #e5e7eb;"><td style="padding:12px 0 8px 0;color:#6b7280;font-weight:600;">Refund Amount:</td><td style="padding:12px 0 8px 0;font-weight:700;font-size:18px;color:#4f46e5;">${formattedPrice}</td></tr>
            </table>
        </div>

        <div style="background:#fef2f2;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #ef4444;">
            <p style="margin:0;color:#991b1b;font-size:14px;">
                <strong>When will I see my refund?</strong><br>
                Refunds typically appear on your statement within <strong>5–10 business days</strong>, depending on your bank or card issuer. If you haven't received it after 10 days, please contact your bank with the Refund ID above.
            </p>
        </div>

        <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px;">We apologize for the inconvenience. You're welcome to search for alternative flights at any time.</p>
${emailClose()}`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Refund Initiated – ${route} (PNR ${pnr})`;
        console.log('[sendFlightRefundEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: FROM_NOREPLY,
                    to: [email],
                    subject,
                    html: emailHtml,
                }),
            });
            const text = await res.text();
            if (res.ok) {
                await logEmail({
                    bookingId,
                    recipient: email,
                    subject,
                    emailType: 'refund',
                    status: 'sent'
                });
                return { success: true };
            }
            await logEmail({
                bookingId,
                recipient: email,
                subject,
                emailType: 'refund',
                status: 'failed',
                errorMessage: text,
                htmlBody: emailHtml,
            });
            return { success: false, error: `Resend ${res.status}: ${text}` };
        }

        await logEmail({
            bookingId,
            recipient: email,
            subject,
            emailType: 'refund',
            status: 'queued',
            htmlBody: emailHtml,
        });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendFlightRefundEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  FLIGHT CANCELLATION EMAIL  (User-initiated cancellation confirmed)
// ═════════════════════════════════════════════════════════════════════

export interface SendFlightCancellationEmailParams {
    bookingId: string;
    pnr: string;
    email: string;
    passengerName: string;
    segments: FlightSegmentEmail[];
    totalPaid: number;
    refundAmount: number;
    penaltyAmount: number;
    currency: string;
}

export async function sendFlightCancellationEmail(
    params: SendFlightCancellationEmailParams,
): Promise<SendFlightBookingEmailResult> {
    const { bookingId, pnr, email, passengerName, segments, totalPaid, refundAmount, penaltyAmount, currency } = params;
    if (!email || !bookingId) return { success: false, error: 'Missing required fields' };

    try {
        const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const route = firstSeg && lastSeg ? `${firstSeg.origin} → ${lastSeg.destination}` : 'N/A';

        const isRefundable = refundAmount > 0;
        const refundBanner = isRefundable
            ? `<div style="background:#f0fdf4;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #22c55e;">
                <p style="margin:0;color:#15803d;font-size:14px;">
                  <strong>Refund of ${fmt(refundAmount)} is being processed.</strong><br>
                  ${penaltyAmount > 0 ? `A cancellation fee of ${fmt(penaltyAmount)} was applied per the airline's fare rules.<br>` : ''}
                  Please allow <strong>5–10 business days</strong> for the refund to appear on your statement.
                </p>
              </div>`
            : `<div style="background:#fef2f2;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #ef4444;">
                <p style="margin:0;color:#991b1b;font-size:14px;">
                  <strong>This fare is non-refundable.</strong><br>
                  No refund will be issued per the airline's fare rules.
                </p>
              </div>`;

        const segmentRows = segments.map((seg) => {
            const depStr = new Date(seg.departureTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
            const arrStr = new Date(seg.arrivalTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
            return `<tr>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(seg.airlineName || seg.airline)}</strong><br><span style="color:#6b7280;font-size:13px;">${escapeHtml(seg.flightNumber)}</span></td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(seg.origin)}</strong><br><span style="color:#6b7280;font-size:13px;">${escapeHtml(depStr)}</span></td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#9ca3af;">→</td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(seg.destination)}</strong><br><span style="color:#6b7280;font-size:13px;">${escapeHtml(arrStr)}</span></td>
            </tr>`;
        }).join('');

        const emailHtml = `${emailOpen('linear-gradient(135deg,#64748b 0%,#475569 100%)', 'Booking Cancelled', escapeHtml(route))}
    <p style="margin:0 0 20px 0;">Dear <strong>${escapeHtml(passengerName)}</strong>,</p>
    <p style="margin:0 0 20px 0;">Your booking for <strong>${escapeHtml(route)}</strong> (PNR: <strong style="font-family:monospace;">${escapeHtml(pnr)}</strong>) has been successfully cancelled.</p>

    <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
      <h2 style="margin:0 0 15px 0;font-size:18px;color:#374151;">Cancellation Summary</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">PNR:</td><td style="padding:8px 0;font-weight:700;font-family:monospace;">${escapeHtml(pnr)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Booking ID:</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${escapeHtml(bookingId)}</td></tr>
        <tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Total Paid:</td><td style="padding:8px 0;font-weight:600;">${fmt(totalPaid)}</td></tr>
        ${penaltyAmount > 0 ? `<tr><td style="padding:8px 0;color:#6b7280;">Cancellation Fee:</td><td style="padding:8px 0;color:#ef4444;font-weight:600;">-${fmt(penaltyAmount)}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#6b7280;font-weight:600;">Refund Amount:</td><td style="padding:8px 0;font-weight:700;font-size:16px;color:${isRefundable ? '#059669' : '#ef4444'};">${isRefundable ? fmt(refundAmount) : 'Non-refundable'}</td></tr>
      </table>
    </div>

    <div style="margin:20px 0;">
      <h3 style="margin:0 0 10px 0;font-size:16px;color:#374151;">Cancelled Itinerary</h3>
      <table style="width:100%;border-collapse:collapse;">${segmentRows}</table>
    </div>

    ${refundBanner}

    <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px;">If you have any questions about your cancellation or refund, please contact our support team.</p>
${emailClose()}`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Booking Cancelled – PNR ${pnr} (${route})`;
        console.log('[sendFlightCancellationEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: FROM_NOREPLY,
                    to: [email],
                    subject,
                    html: emailHtml,
                }),
            });
            const text = await res.text();
            if (res.ok) {
                await logEmail({
                    bookingId,
                    recipient: email,
                    subject,
                    emailType: 'cancellation',
                    status: 'sent'
                });
                return { success: true };
            }
            await logEmail({
                bookingId,
                recipient: email,
                subject,
                emailType: 'cancellation',
                status: 'failed',
                errorMessage: text,
                htmlBody: emailHtml,
            });
            return { success: false, error: `Resend ${res.status}: ${text}` };
        }

        await logEmail({
            bookingId,
            recipient: email,
            subject,
            emailType: 'cancellation',
            status: 'queued',
            htmlBody: emailHtml,
        });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendFlightCancellationEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  FLIGHT CANCELLATION REFUND CONFIRMED EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface SendFlightCancellationRefundEmailParams {
    bookingId: string;
    pnr: string;
    email: string;
    passengerName: string;
    route: string;
    refundAmount: number;
    currency: string;
    stripeRefundId?: string;
}

export async function sendFlightCancellationRefundEmail(
    params: SendFlightCancellationRefundEmailParams,
): Promise<SendFlightBookingEmailResult> {
    const { bookingId, pnr, email, passengerName, route, refundAmount, currency, stripeRefundId } = params;
    if (!email || !bookingId) return { success: false, error: 'Missing required fields' };

    try {
        const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);

        const emailHtml = `${emailOpen('linear-gradient(135deg,#059669 0%,#047857 100%)', 'Refund Confirmed', escapeHtml(route))}
    <p style="margin:0 0 20px 0;">Dear <strong>${escapeHtml(passengerName)}</strong>,</p>
    <p style="margin:0 0 20px 0;">Great news — your refund of <strong>${fmt(refundAmount)}</strong> for booking <strong style="font-family:monospace;">${escapeHtml(pnr)}</strong> has been successfully processed and is on its way back to your original payment method.</p>

    <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
      <h2 style="margin:0 0 15px 0;font-size:18px;color:#374151;">Refund Details</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">PNR:</td><td style="padding:8px 0;font-weight:700;font-family:monospace;">${escapeHtml(pnr)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Booking ID:</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${escapeHtml(bookingId)}</td></tr>
        ${stripeRefundId ? `<tr><td style="padding:8px 0;color:#6b7280;">Refund Reference:</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${escapeHtml(stripeRefundId)}</td></tr>` : ''}
        <tr style="border-top:1px solid #e5e7eb;"><td style="padding:12px 0 8px 0;color:#6b7280;font-weight:600;">Refund Amount:</td><td style="padding:12px 0 8px 0;font-weight:700;font-size:20px;color:#059669;">${fmt(refundAmount)}</td></tr>
      </table>
    </div>

    <div style="background:#f0fdf4;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #22c55e;">
      <p style="margin:0;color:#15803d;font-size:14px;">
        <strong>When will I see it?</strong><br>
        Refunds typically appear on your statement within <strong>3–5 business days</strong> for credit cards, or up to 10 business days for debit cards, depending on your bank. If you haven't received it after 10 days, please contact your bank with the Refund Reference above.
      </p>
    </div>

    <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px;">Thank you for choosing ${BRAND_NAME}. We hope to serve you again soon.</p>
${emailClose()}`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Refund Confirmed – ${fmt(refundAmount)} for PNR ${pnr}`;
        console.log('[sendFlightCancellationRefundEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: FROM_NOREPLY,
                    to: [email],
                    subject,
                    html: emailHtml,
                }),
            });
            const text = await res.text();
            if (res.ok) {
                await logEmail({
                    bookingId,
                    recipient: email,
                    subject,
                    emailType: 'refund',
                    status: 'sent'
                });
                return { success: true };
            }
            await logEmail({
                bookingId,
                recipient: email,
                subject,
                emailType: 'refund',
                status: 'failed',
                errorMessage: text,
                htmlBody: emailHtml,
            });
            return { success: false, error: `Resend ${res.status}: ${text}` };
        }

        await logEmail({
            bookingId,
            recipient: email,
            subject,
            emailType: 'refund',
            status: 'queued',
            htmlBody: emailHtml,
        });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendFlightCancellationRefundEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  PRICE ALERT EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface SendPriceAlertEmailParams {
    email: string;
    origin: string;
    destination: string;
    newPrice: number;
    oldPrice: number | null;
    currency: string;
    cabin: string;
    adults: number;
    searchUrl: string;
}

// ═════════════════════════════════════════════════════════════════════
//  HOTEL REFUND RECEIPT EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface SendHotelRefundEmailParams {
    bookingId: string;
    email: string;
    guestName: string;
    hotelName: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    refundAmount: number;
    currency: string;
    stripeRefundId?: string;
}

export async function sendHotelRefundEmail(params: SendHotelRefundEmailParams): Promise<{ success: boolean; error?: string }> {
    const { bookingId, email, guestName, hotelName, roomName, checkIn, checkOut, refundAmount, currency, stripeRefundId } = params;
    if (!email || !bookingId) return { success: false, error: 'Missing required fields' };

    const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

    const emailHtml = `${emailOpen('linear-gradient(135deg,#059669 0%,#047857 100%)', 'Refund Confirmed', escapeHtml(hotelName))}
    <p style="margin:0 0 20px 0;">Dear <strong>${escapeHtml(guestName)}</strong>,</p>
    <p style="margin:0 0 20px 0;">Your refund of <strong>${fmt(refundAmount)}</strong> for your cancelled reservation at <strong>${escapeHtml(hotelName)}</strong> has been successfully processed and is on its way back to your original payment method.</p>

    <div style="background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;">
      <h2 style="margin:0 0 15px 0;font-size:18px;color:#374151;">Refund Details</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;">Booking ID:</td><td style="padding:8px 0;font-weight:600;font-family:monospace;">${escapeHtml(bookingId)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Property:</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(hotelName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Room:</td><td style="padding:8px 0;">${escapeHtml(roomName)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Check-in:</td><td style="padding:8px 0;">${escapeHtml(checkIn)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Check-out:</td><td style="padding:8px 0;">${escapeHtml(checkOut)}</td></tr>
        ${stripeRefundId ? `<tr><td style="padding:8px 0;color:#6b7280;">Refund Reference:</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${escapeHtml(stripeRefundId)}</td></tr>` : ''}
        <tr style="border-top:1px solid #e5e7eb;"><td style="padding:12px 0 8px 0;color:#6b7280;font-weight:600;">Refund Amount:</td><td style="padding:12px 0 8px 0;font-weight:700;font-size:20px;color:#059669;">${fmt(refundAmount)}</td></tr>
      </table>
    </div>

    <div style="background:#f0fdf4;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #22c55e;">
      <p style="margin:0;color:#15803d;font-size:14px;">
        <strong>When will I see it?</strong><br>
        Refunds typically appear within <strong>3–5 business days</strong> for credit cards, or up to 10 business days for debit cards. If you haven't received it after 10 days, contact your bank with the Refund Reference above.
      </p>
    </div>

    <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px;">Thank you for choosing ${BRAND_NAME}. We hope to see you again soon.</p>
${emailClose()}`;

    const resendApiKey = env.RESEND_API_KEY;
    const subject = `Refund Confirmed – ${fmt(refundAmount)} for ${hotelName}`;

    try {
        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: FROM_NOREPLY, to: [email], subject, html: emailHtml }),
            });
            const text = await res.text();
            if (res.ok) {
                await logEmail({ bookingId, recipient: email, subject, emailType: 'refund', status: 'sent' });
                return { success: true };
            }
            await logEmail({ bookingId, recipient: email, subject, emailType: 'refund', status: 'failed', errorMessage: text, htmlBody: emailHtml });
            return { success: false, error: `Resend ${res.status}: ${text}` };
        }
        await logEmail({ bookingId, recipient: email, subject, emailType: 'refund', status: 'queued', htmlBody: emailHtml });
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendHotelRefundEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  PRICE ALERT CONFIRMATION EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface PriceAlertConfirmationParams {
    email: string;
    origin: string;
    destination: string;
    cabin: string;
    adults: number;
    alertId?: string;
    targetPrice?: number | null;
    currency?: string;
}

export async function sendPriceAlertConfirmationEmail(params: PriceAlertConfirmationParams): Promise<{ success: boolean; error?: string }> {
    const { email, origin, destination, cabin, adults, alertId, targetPrice, currency = 'USD' } = params;
    const resendApiKey = env.RESEND_API_KEY;
    const cabinLabel = cabin.replace('_', ' ');

    const formattedTarget = targetPrice
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(targetPrice)
        : null;

    const emailHtml = `${emailOpen('linear-gradient(135deg,#6366f1,#4f46e5)', 'Price Alert Active!', `${escapeHtml(origin)} → ${escapeHtml(destination)}`)}
  <p style="margin:0 0 20px">We've started tracking prices for your trip. You'll be the first to know when fares drop!</p>
  
  <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:0 0 20px;">
    <h3 style="margin:0 0 12px;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Your Alert Settings</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:4px 0;color:#64748b;">Route:</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(origin)} &rarr; ${escapeHtml(destination)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Cabin:</td><td style="padding:4px 0;text-transform:capitalize;">${escapeHtml(cabinLabel)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Passengers:</td><td style="padding:4px 0;">${adults} adult${adults > 1 ? 's' : ''}</td></tr>
      ${formattedTarget ? `<tr><td style="padding:4px 0;color:#64748b;">Target Price:</td><td style="padding:4px 0;font-weight:600;color:#4f46e5;">${escapeHtml(formattedTarget)}</td></tr>` : ''}
    </table>
  </div>

  <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
    <h4 style="margin:0 0 8px;font-size:15px;">What happens next?</h4>
    <p style="margin:0;font-size:14px;color:#475569;">Our system checks live prices daily. If we find a lower fare for your route, we'll send you an alert with a direct link to book the deal.</p>
  </div>
${emailClose(`You&apos;re receiving this because you set a price alert on ${BRAND_NAME}.<br>&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.`)}`;

    if (!resendApiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

    const subject = `Watching prices: ${origin} \u2192 ${destination}`;

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: FROM_NOREPLY,
                to: [email],
                subject,
                html: emailHtml,
            }),
        });

        if (res.ok) {
            await logEmail({
                recipient: email,
                subject,
                emailType: 'price_alert',
                status: 'sent',
                metadata: { alertId, type: 'confirmation' }
            });
            return { success: true };
        }
        
        const err = await res.text();
        await logEmail({
            recipient: email,
            subject,
            emailType: 'price_alert',
            status: 'failed',
            errorMessage: err,
            metadata: { alertId, type: 'confirmation' }
        });
        return { success: false, error: err };
    } catch (error) {
        console.error('[sendPriceAlertConfirmationEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send' };
    }
}

// ═════════════════════════════════════════════════════════════════════
//  PRICE DROP ALERT EMAIL
// ═════════════════════════════════════════════════════════════════════

export async function sendPriceAlertEmail(params: SendPriceAlertEmailParams): Promise<{ success: boolean; error?: string }> {
    const { email, origin, destination, newPrice, oldPrice, currency, cabin, adults, searchUrl } = params;
    const resendApiKey = env.RESEND_API_KEY;

    const formattedNew = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(newPrice);
    const formattedOld = oldPrice ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(oldPrice) : null;
    const drop = oldPrice ? Math.round(((oldPrice - newPrice) / oldPrice) * 100) : null;
    const cabinLabel = cabin.replace('_', ' ');

    const emailHtml = `${emailOpen('linear-gradient(135deg,#10b981,#059669)', 'Price Drop Alert!', `${escapeHtml(origin)} → ${escapeHtml(destination)}`)}
  <p style="margin:0 0 20px">Great news! The price for your tracked route has ${drop && drop > 0 ? `dropped by <strong>${drop}%</strong>` : 'changed'}.</p>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 20px;text-align:center;">
    ${formattedOld ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-decoration:line-through;">${escapeHtml(formattedOld)}</p>` : ''}
    <p style="margin:0;font-size:32px;font-weight:800;color:#059669;">${escapeHtml(formattedNew)}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${adults} adult${adults > 1 ? 's' : ''} &middot; ${escapeHtml(cabinLabel)}</p>
  </div>
  <a href="${escapeHtml(searchUrl)}" style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;font-weight:700;font-size:16px;margin:0 0 20px">Book Now</a>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">Prices change frequently. This fare may not be available when you search.</p>
${emailClose(`You&apos;re receiving this because you set a price alert on ${BRAND_NAME}.<br>&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.`)}`;

    if (!resendApiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

    const subject = `Price drop: ${origin} \u2192 ${destination} now ${formattedNew}`;

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: FROM_ALERTS,
                to: [email],
                subject,
                html: emailHtml,
            }),
        });

        if (res.ok) {
            await logEmail({
                recipient: email,
                subject,
                emailType: 'price_alert',
                status: 'sent',
                metadata: { type: 'drop_alert' }
            });
            return { success: true };
        }

        const err = await res.text();
        await logEmail({
            recipient: email,
            subject,
            emailType: 'price_alert',
            status: 'failed',
            errorMessage: err,
            metadata: { type: 'drop_alert' }
        });
        return { success: false, error: err };
    } catch (error) {
        console.error('[sendPriceAlertEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send' };
    }
}
