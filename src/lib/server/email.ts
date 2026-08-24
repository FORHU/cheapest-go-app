import { createAdminClient } from '@/utils/postgres/admin';
import { env } from "@/utils/env";
import fs from 'fs';
import path from 'path';
import { calculateNights } from '@/lib/utils';
import { derivePolicyType, getFreeCancelDeadline, formatPolicyDescription } from '@/lib/policy-formatter';

// ─── Sending addresses ────────────────────────────────────────────────
// Verified domain: mail.cheapestgo.com (Resend, ap-northeast-1)
// Change these two constants if the sending domain ever changes.
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';
const BRAND_EMAIL = process.env.NEXT_PUBLIC_BRAND_EMAIL ?? 'no-reply@mail.cheapestgo.com';
const BRAND_LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO ?? '/Web_Logo_Transparent.png';

// Inline the logo as base64 so email clients display it without fetching an external URL.
// (External URLs are blocked by default in Gmail, Outlook, etc. until the user enables images.)
// Falls back to the public site URL if the file cannot be read (e.g. missing in the build).
const _siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cheapestgo.com';
const EMAIL_BASE_URL = /localhost|127\.0\.0\.1/.test(_siteUrl) ? 'https://cheapestgo.com' : _siteUrl;
const BRAND_LOGO_URL = (() => {
    try {
        const filePath = path.join(process.cwd(), 'public', BRAND_LOGO);
        const data = fs.readFileSync(filePath);
        const ext = path.extname(BRAND_LOGO).slice(1).toLowerCase().replace('jpg', 'jpeg');
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext || 'png'}`;
        return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
        return `${EMAIL_BASE_URL}${BRAND_LOGO}`;
    }
})();

export const FROM_NOREPLY = `${BRAND_NAME} <${BRAND_EMAIL}>`;
export const FROM_ALERTS  = `${BRAND_NAME} Alerts <${BRAND_EMAIL}>`;

// Small square mark (26x26 masthead icon) used by the redesigned hotel confirmation email —
// distinct from BRAND_LOGO_URL above, which is the full wordmark used in the legacy header.
const BRAND_ICON_URL = (() => {
    try {
        const data = fs.readFileSync(path.join(process.cwd(), 'public', 'icon-512.png'));
        return `data:image/png;base64,${data.toString('base64')}`;
    } catch {
        return `${EMAIL_BASE_URL}/icon-512.png`;
    }
})();

// Fallback thumbnail when a booking has no property image on file.
const PROPERTY_PLACEHOLDER_URL = (() => {
    try {
        const data = fs.readFileSync(path.join(process.cwd(), 'public', 'hotel-placeholder.png'));
        return `data:image/png;base64,${data.toString('base64')}`;
    } catch {
        return `${EMAIL_BASE_URL}/hotel-placeholder.png`;
    }
})();

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
    dbId?: string; // DB UUID — used for manage/receipt links
    email: string;
    guestName: string;
    hotelName: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    totalPrice: number;
    currency: string;
    // Optional richer content for the redesigned confirmation email — all degrade
    // gracefully (row/section omitted) when not supplied.
    propertyImage?: string;
    propertyAddress?: string;
    propertyCity?: string;
    propertyCountry?: string;
    starRating?: number;
    reviewRating?: number;
    reviewCount?: number;
    checkInTime?: string;
    checkOutTime?: string;
    adults?: number;
    children?: number;
    /** Voucher/promo credit already netted out of totalPrice — shown as a separate line item. */
    discountAmount?: number;
    cancellationPolicy?: {
        refundableTag?: string;
        cancelPolicyInfos?: { cancelTime: string; amount: number; currency: string; type: string }[];
    } | null;
}

export interface SendBookingEmailResult {
    success: boolean;
    error?: string;
}

/**
 * Pure render of the hotel booking confirmation email — no I/O, no side effects.
 * Split out from sendBookingConfirmationEmail so it can be unit-previewed (e.g. via
 * /api/test-email?debug=html) without touching the DB or Resend.
 */
export function buildHotelConfirmationEmailHtml(params: SendBookingEmailParams): string {
    const {
        bookingId, dbId, guestName, hotelName, roomName, checkIn, checkOut, totalPrice, currency,
        propertyImage, propertyAddress, propertyCity, propertyCountry, starRating, reviewRating, reviewCount,
        checkInTime, checkOutTime, adults, children, discountAmount, cancellationPolicy,
    } = params;
    const siteUrl = env.SITE_URL;
    const receiptUrl = dbId ? `${siteUrl}/trips/invoice/${dbId}?type=hotel` : null;
    const manageUrl = dbId ? `${siteUrl}/trips/${dbId}` : null;

    const nights = Math.max(1, calculateNights(checkIn, checkOut));
        const firstName = escapeHtml((guestName || '').trim().split(/\s+/)[0] || 'there');

        const fmtMoney = (n: number) => new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: currency || 'PHP',
        }).format(n);
        const formattedPrice = fmtMoney(totalPrice);

        const fmtLongDate = (dateStr: string) => {
            try {
                return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
                });
            } catch {
                return dateStr;
            }
        };
        const checkInLabel = `${fmtLongDate(checkIn)}${checkInTime ? ` · from ${escapeHtml(checkInTime)}` : ''}`;
        const checkOutLabel = `${fmtLongDate(checkOut)}${checkOutTime ? ` · by ${escapeHtml(checkOutTime)}` : ''}`;

        const cityCountry = [propertyCity, propertyCountry].filter(Boolean).join(', ');
        const ratingLine = reviewRating
            ? `${reviewRating} guest rating${reviewCount ? ` (${reviewCount})` : ''}`
            : (starRating ? `${starRating}-star hotel` : '');
        const mapQuery = encodeURIComponent(propertyAddress || [hotelName, propertyCity].filter(Boolean).join(', '));

        const hasPolicyData = !!(cancellationPolicy?.cancelPolicyInfos?.length || cancellationPolicy?.refundableTag);
        const policyText = hasPolicyData
            ? formatPolicyDescription(
                derivePolicyType(cancellationPolicy?.refundableTag, cancellationPolicy?.cancelPolicyInfos),
                getFreeCancelDeadline(cancellationPolicy?.cancelPolicyInfos, cancellationPolicy?.refundableTag),
              )
            : "Cancellation terms for this rate are shown on your booking confirmation and receipt.";

        const occupancyLine = adults
            ? `${adults} adult${adults === 1 ? '' : 's'}${children ? `, ${children} child${children === 1 ? '' : 'ren'}` : ''}`
            : '';

        const hasCredit = !!discountAmount && discountAmount > 0;
        const preheader = escapeHtml(`Booking ${bookingId} is confirmed — ${hotelName}, ${fmtLongDate(checkIn)}–${fmtLongDate(checkOut)}, ${nights} night${nights === 1 ? '' : 's'}.`);
        const propertyImageSrc = escapeHtml(propertyImage) || PROPERTY_PLACEHOLDER_URL;

        // Build email HTML content
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your booking is confirmed</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; }
    .stack-pad { padding: 0 0 18px 0 !important; }
    .col2 { display: block !important; width: 100% !important; padding: 0 0 18px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<span style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
<tr><td align="center" style="padding:20px 12px 32px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;">

  <!-- Masthead -->
  <tr><td class="px" style="padding:8px 4px 14px 4px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:9px;line-height:0;"><img src="${BRAND_ICON_URL}" width="26" height="26" alt="${BRAND_NAME}" style="display:block;width:26px;height:26px;border:0;border-radius:13px;"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">cheapest<span style="color:#2563eb;">Go</span></td>
          </tr></table>
        </td>
        <td align="right" style="font-size:15px;font-weight:bold;color:#0f172a;letter-spacing:-0.2px;">Hello, ${firstName}</td>
      </tr>
    </table>
  </td></tr>

  <!-- Panel: confirmation + CTA -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:28px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:20px;line-height:26px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">Your booking is now confirmed</div>
        <div style="height:12px;line-height:12px;">&nbsp;</div>
        <div style="font-size:14px;line-height:22px;color:#475569;">For reference, your booking ID is <span style="font-family:'Courier New',Courier,monospace;font-weight:bold;color:#0f172a;">${escapeHtml(bookingId)}</span>. ${manageUrl ? 'To view, cancel, or modify your booking, use our easy self-service.' : 'If you need to view, cancel, or modify this booking, please contact support.'}</div>
        ${manageUrl ? `
        <div style="height:22px;line-height:22px;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr><td align="center" bgcolor="#2563eb" style="border-radius:14px;">
            <a href="${manageUrl}" style="display:block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px;mso-line-height-rule:exactly;line-height:18px;">Manage my booking</a>
          </td></tr>
        </table>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: property -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:20px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="150" class="stack stack-pad" style="width:150px;padding-right:20px;vertical-align:top;">
              <img src="${propertyImageSrc}" width="150" height="104" alt="${escapeHtml(hotelName)}" style="display:block;width:150px;height:104px;border:0;border-radius:10px;object-fit:cover;background-color:#e2e8f0;">
            </td>
            <td class="stack" style="font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
              <div style="font-size:16px;font-weight:bold;color:#0f172a;line-height:21px;">${escapeHtml(hotelName)}</div>
              <div style="height:5px;line-height:5px;">&nbsp;</div>
              ${cityCountry ? `<div style="font-size:13px;line-height:19px;color:#64748b;">${escapeHtml(cityCountry)}</div>` : ''}
              ${ratingLine ? `<div style="font-size:13px;line-height:19px;color:#64748b;">${escapeHtml(ratingLine)}</div>` : ''}
              ${propertyAddress ? `<div style="height:6px;line-height:6px;">&nbsp;</div><div style="font-size:12px;line-height:18px;color:#94a3b8;">${escapeHtml(propertyAddress)}</div>` : ''}
              <div style="height:8px;line-height:8px;">&nbsp;</div>
              <a href="https://www.google.com/maps/search/?api=1&amp;query=${mapQuery}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Directions</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: reservation -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:8px 28px 10px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          <tr>
            <td style="padding:14px 0;color:#64748b;">Reservation</td>
            <td align="right" style="padding:14px 0;color:#0f172a;font-weight:bold;">1 room, ${nights} night${nights === 1 ? '' : 's'}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Room type</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(roomName)}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Check in</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${checkInLabel}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Check out</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${checkOutLabel}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Lead guest</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(guestName)}</td>
          </tr>
          ${occupancyLine ? `
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Occupancy</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(occupancyLine)}</td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: payment -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2563eb;">Your booking is paid and confirmed</td></tr>
      <tr><td class="px" style="padding:8px 28px 4px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          ${hasCredit ? `
          <tr>
            <td style="padding:12px 0;border-top:1px solid #eef2f7;color:#64748b;">Room total</td>
            <td align="right" style="padding:12px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#0f172a;">${fmtMoney(totalPrice + discountAmount!)}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-top:1px solid #eef2f7;color:#64748b;">CheapestGo credit</td>
            <td align="right" style="padding:12px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#16a34a;">− ${fmtMoney(discountAmount!)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:14px 0;${hasCredit ? 'border-top:1px solid #e2e8f0;' : ''}font-size:15px;font-weight:bold;color:#0f172a;">You pay</td>
            <td align="right" style="padding:14px 0;${hasCredit ? 'border-top:1px solid #e2e8f0;' : ''}font-family:'Courier New',Courier,monospace;font-size:17px;font-weight:bold;color:#0f172a;">${formattedPrice}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td class="px" style="padding:8px 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="height:1px;line-height:1px;background-color:#eef2f7;">&nbsp;</div>
        <div style="height:18px;line-height:18px;">&nbsp;</div>
        <div style="font-size:14px;font-weight:bold;color:#0f172a;">Cancellation and change policy</div>
        <div style="height:8px;line-height:8px;">&nbsp;</div>
        <div style="font-size:13px;line-height:21px;color:#64748b;">${escapeHtml(policyText)}</div>
      </td></tr>
    </table>
  </td></tr>

  ${manageUrl ? `
  <!-- Panel: manage my booking -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#0f172a;">Manage my booking</td></tr>
      <tr><td class="px" style="padding:14px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#64748b;">Sign in any time to get a receipt or cancel your booking.</td></tr>
      <tr><td class="px" style="padding:22px 28px 26px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td width="50%" class="col2" style="width:50%;padding-right:16px;vertical-align:top;">
              <a href="${receiptUrl}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Download a receipt</a>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:18px;color:#94a3b8;">Get a receipt sent to you for business use.</div>
            </td>
            <td width="50%" class="col2" style="width:50%;vertical-align:top;">
              <a href="${manageUrl}" style="font-size:13px;font-weight:bold;color:#e11d48;text-decoration:none;">Cancel booking</a>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:18px;color:#94a3b8;">Cancel your booking online easily.</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td class="px" style="padding:16px 8px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;">
    This is a transactional message about booking ${escapeHtml(bookingId)}.<br>
    &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND_NAME)}. All rights reserved.<br>
    <a href="${siteUrl}/account" style="color:#64748b;text-decoration:underline;">Email preferences</a>
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
        const emailHtml = buildHotelConfirmationEmailHtml(params);

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
    dbId?: string; // DB UUID — reserved for parity with the other emails (no booking-specific CTA needs it today)
    email: string;
    guestName: string;
    hotelName: string;
    propertyImage?: string;
    propertyCity?: string;
    propertyCountry?: string;
    starRating?: number;
    reviewRating?: number;
    reviewCount?: number;
    roomName: string;
    checkIn: string;
    checkOut: string;
    /** Original amount paid for the booking — shown as "Amount originally paid" / "Total charged". */
    totalPrice?: number;
    refundAmount?: number;
    /** Cancellation fee already netted out of refundAmount. */
    penaltyAmount?: number;
    currency?: string;
    refundStatus?: string; // 'processed' | 'failed' | 'non_refundable'
    /** Internal refund-request reference, shown as "Cancellation ID". */
    cancellationRef?: string;
}

/**
 * Pure render of the booking-cancelled email — no I/O, no side effects.
 * Split out so it can be unit-previewed (e.g. via /api/test-email?debug=html) without
 * touching the DB or Resend.
 */
export function buildHotelCancellationEmailHtml(params: SendHotelCancellationEmailParams): string {
    const {
        bookingId, guestName, hotelName, propertyImage, propertyCity, propertyCountry,
        starRating, reviewRating, reviewCount, roomName, checkIn, checkOut, totalPrice,
        refundAmount, penaltyAmount, currency = 'PHP', refundStatus, cancellationRef,
    } = params;
    const siteUrl = env.SITE_URL;

    const firstName = escapeHtml((guestName || '').trim().split(/\s+/)[0] || 'there');
    const nights = Math.max(1, calculateNights(checkIn, checkOut));

    const fmtMoney = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency || 'PHP' }).format(n);
    const fmtShortDate = (dateStr: string) => {
        try {
            return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        } catch {
            return dateStr;
        }
    };
    const checkOutYear = (() => {
        try {
            return new Date(`${checkOut}T00:00:00`).getFullYear();
        } catch {
            return new Date().getFullYear();
        }
    })();
    const cancelledLabel = new Date().toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const cityCountry = [propertyCity, propertyCountry].filter(Boolean).join(', ');
    const ratingLine = reviewRating
        ? `${reviewRating} guest rating${reviewCount ? ` (${reviewCount})` : ''}`
        : (starRating ? `${starRating}-star hotel` : '');
    const searchUrl = propertyCity ? `${siteUrl}/search?destination=${encodeURIComponent(propertyCity)}` : `${siteUrl}/search`;
    const propertyImageSrc = escapeHtml(propertyImage) || PROPERTY_PLACEHOLDER_URL;

    const isProcessed = refundStatus === 'processed' && (refundAmount ?? 0) > 0;
    const isFailed = refundStatus === 'failed';
    const hasCharge = !!penaltyAmount && penaltyAmount > 0;
    const totalPaid = totalPrice ?? ((refundAmount ?? 0) + (penaltyAmount ?? 0));

    const refundPanel = isProcessed ? `
  <!-- Panel: refund -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2563eb;">Your refund is on the way</td></tr>
      <tr><td class="px" style="padding:8px 28px 4px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          ${hasCharge ? `
          <tr>
            <td style="padding:12px 0;border-top:1px solid #eef2f7;color:#64748b;">Amount originally paid</td>
            <td align="right" style="padding:12px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#0f172a;">${fmtMoney(totalPaid)}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-top:1px solid #eef2f7;color:#64748b;">Cancellation charge</td>
            <td align="right" style="padding:12px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#e11d48;">− ${fmtMoney(penaltyAmount!)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:14px 0;${hasCharge ? 'border-top:1px solid #e2e8f0;' : ''}font-size:15px;font-weight:bold;color:#0f172a;">Total refund</td>
            <td align="right" style="padding:14px 0;${hasCharge ? 'border-top:1px solid #e2e8f0;' : ''}font-family:'Courier New',Courier,monospace;font-size:17px;font-weight:bold;color:#16a34a;">${fmtMoney(refundAmount!)}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td class="px" style="padding:0 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="height:1px;line-height:1px;background-color:#eef2f7;">&nbsp;</div>
        <div style="height:18px;line-height:18px;">&nbsp;</div>
        <div style="font-size:14px;font-weight:bold;color:#0f172a;">When you'll see it</div>
        <div style="height:8px;line-height:8px;">&nbsp;</div>
        <div style="font-size:13px;line-height:21px;color:#64748b;">Card refunds usually appear within 5–10 business days, depending on your bank. We'll email you again the moment it's issued.</div>
      </td></tr>
    </table>
  </td></tr>` : isFailed ? `
  <!-- Panel: refund -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#b45309;">We're finalizing your refund</td></tr>
      <tr><td class="px" style="padding:8px 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#64748b;">Your cancellation was successful, but we hit a snag issuing the refund automatically. Our team has been notified and will process it manually — no action is needed from you. If you don't see it within 10 business days, contact support${cancellationRef ? ` and quote cancellation reference <span style="font-family:'Courier New',Courier,monospace;font-weight:bold;color:#0f172a;">${escapeHtml(cancellationRef)}</span>` : ''}.</td></tr>
    </table>
  </td></tr>` : `
  <!-- Panel: refund -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#0f172a;">This booking was non-refundable</td></tr>
      <tr><td class="px" style="padding:8px 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#64748b;">No refund was issued per the property's cancellation policy — the free-cancellation window had already passed. Total charged: <strong style="color:#0f172a;">${fmtMoney(totalPaid)}</strong>.</td></tr>
    </table>
  </td></tr>`;

    const preheader = escapeHtml(`Booking ${bookingId} is cancelled — ${hotelName}, ${fmtShortDate(checkIn)}–${fmtShortDate(checkOut)}.${isProcessed ? ` Refund of ${fmtMoney(refundAmount!)} is on the way.` : ''}`);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your booking has been cancelled</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; }
    .stack-pad { padding: 0 0 18px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<span style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
<tr><td align="center" style="padding:20px 12px 32px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;">

  <!-- Masthead -->
  <tr><td class="px" style="padding:8px 4px 14px 4px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:9px;line-height:0;"><img src="${BRAND_ICON_URL}" width="26" height="26" alt="${BRAND_NAME}" style="display:block;width:26px;height:26px;border:0;border-radius:13px;"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">cheapest<span style="color:#2563eb;">Go</span></td>
          </tr></table>
        </td>
        <td align="right" style="font-size:15px;font-weight:bold;color:#0f172a;letter-spacing:-0.2px;">Hello, ${firstName}</td>
      </tr>
    </table>
  </td></tr>

  <!-- Panel: cancellation + CTA -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:28px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:20px;line-height:26px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">Your booking has been cancelled</div>
        <div style="height:12px;line-height:12px;">&nbsp;</div>
        <div style="font-size:14px;line-height:22px;color:#475569;">Booking <span style="font-family:'Courier New',Courier,monospace;font-weight:bold;color:#0f172a;">${escapeHtml(bookingId)}</span> at ${escapeHtml(hotelName)} was cancelled on <strong style="color:#0f172a;">${cancelledLabel}</strong>. The property has been notified and your room has been released.</div>
        <div style="height:22px;line-height:22px;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr><td align="center" bgcolor="#2563eb" style="border-radius:14px;">
            <a href="${searchUrl}" style="display:block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px;mso-line-height-rule:exactly;line-height:18px;">Find another stay${propertyCity ? ` in ${escapeHtml(propertyCity)}` : ''}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: property -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:20px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="150" class="stack stack-pad" style="width:150px;padding-right:20px;vertical-align:top;">
              <img src="${propertyImageSrc}" width="150" height="104" alt="${escapeHtml(hotelName)}" style="display:block;width:150px;height:104px;border:0;border-radius:10px;object-fit:cover;background-color:#e2e8f0;">
            </td>
            <td class="stack" style="font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
              <div style="font-size:16px;font-weight:bold;color:#0f172a;line-height:21px;">${escapeHtml(hotelName)}</div>
              <div style="height:5px;line-height:5px;">&nbsp;</div>
              ${cityCountry ? `<div style="font-size:13px;line-height:19px;color:#64748b;">${escapeHtml(cityCountry)}</div>` : ''}
              ${ratingLine ? `<div style="font-size:13px;line-height:19px;color:#64748b;">${escapeHtml(ratingLine)}</div>` : ''}
              <div style="height:8px;line-height:8px;">&nbsp;</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#fff1f2" style="border-radius:999px;padding:5px 11px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#e11d48;">Cancelled</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: cancelled reservation -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:8px 28px 10px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          <tr>
            <td style="padding:14px 0;color:#64748b;">Cancelled reservation</td>
            <td align="right" style="padding:14px 0;color:#0f172a;font-weight:bold;">1 room, ${nights} night${nights === 1 ? '' : 's'}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Room type</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(roomName)}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Original stay</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${fmtShortDate(checkIn)} – ${fmtShortDate(checkOut)} ${checkOutYear}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Lead guest</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(guestName)}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Cancelled by</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">Online (self-service)</td>
          </tr>
          ${cancellationRef ? `
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Cancellation ID</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#0f172a;font-weight:bold;">${escapeHtml(cancellationRef)}</td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>
${refundPanel}
  <!-- Footer -->
  <tr><td class="px" style="padding:16px 8px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;">
    This is a transactional message about booking ${escapeHtml(bookingId)}.<br>
    &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND_NAME)}. All rights reserved.<br>
    <a href="${siteUrl}/account" style="color:#64748b;text-decoration:underline;">Email preferences</a>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

export async function sendHotelCancellationEmail(
    params: SendHotelCancellationEmailParams
): Promise<SendBookingEmailResult> {
    const { bookingId, email, hotelName } = params;

    if (!email || !bookingId) {
        return { success: false, error: 'Missing required fields' };
    }

    try {
        const emailHtml = buildHotelCancellationEmailHtml(params);

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
    dbId?: string; // DB UUID — used for manage/receipt links
    email: string; // recipient — the (possibly new) email on the booking
    guestName: string; // the (possibly new) full guest name
    hotelName: string;
    propertyImage?: string;
    roomName?: string;
    checkIn?: string;
    checkOut?: string;
    adults?: number;
    children?: number;
    remarks?: string | null; // the (possibly new) special-requests text
    changes: string; // fallback summary used in the subject line, e.g. "Guest name, special requests"
    /** Field values as they were immediately before this amendment. Enables an exact before/after diff. */
    previous?: {
        firstName: string;
        lastName: string;
        email: string;
        remarks: string | null;
    };
}

/**
 * Pure render of the hotel amendment email — no I/O, no side effects.
 * Split out so it can be unit-previewed (e.g. via /api/test-email?debug=html) without
 * touching the DB or Resend.
 */
export function buildHotelAmendmentEmailHtml(params: SendHotelAmendmentEmailParams): string {
    const {
        bookingId, dbId, email, guestName, hotelName, propertyImage, roomName, checkIn, checkOut,
        adults, children, remarks, changes, previous,
    } = params;
    const siteUrl = env.SITE_URL;
    const receiptUrl = dbId ? `${siteUrl}/trips/invoice/${dbId}?type=hotel` : null;
    const manageUrl = dbId ? `${siteUrl}/trips/${dbId}` : null;

    const firstName = escapeHtml((guestName || '').trim().split(/\s+/)[0] || 'there');

    const fmtLongDate = (dateStr: string) => {
        try {
            return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };
    const savedLabel = new Date().toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });

    // Before/after diff — only rows that actually changed.
    const diffRows: { label: string; before: string; after: string }[] = [];
    if (previous) {
        const prevName = `${previous.firstName} ${previous.lastName}`.trim();
        if (prevName && prevName !== guestName) diffRows.push({ label: 'Lead guest', before: prevName, after: guestName });
        if (previous.email && previous.email !== email) diffRows.push({ label: 'Email', before: previous.email, after: email });
        const prevRemarks = previous.remarks?.trim() || '—';
        const newRemarks = remarks?.trim() || '—';
        if (prevRemarks !== newRemarks) diffRows.push({ label: 'Special requests', before: prevRemarks, after: newRemarks });
    }

    const hasReservation = !!(roomName && checkIn && checkOut);
    const nights = hasReservation ? Math.max(1, calculateNights(checkIn!, checkOut!)) : 0;
    const occupancyLine = adults
        ? `${adults} adult${adults === 1 ? '' : 's'}${children ? `, ${children} child${children === 1 ? '' : 'ren'}` : ''}`
        : '';

    const preheader = escapeHtml(`Booking ${bookingId} updated — ${changes || 'details changed'}.`);
    const propertyImageSrc = escapeHtml(propertyImage) || PROPERTY_PLACEHOLDER_URL;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your booking has been updated</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; }
    .stack-pad { padding: 0 0 18px 0 !important; }
    .col2 { display: block !important; width: 100% !important; padding: 0 0 18px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<span style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
<tr><td align="center" style="padding:20px 12px 32px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;">

  <!-- Masthead -->
  <tr><td class="px" style="padding:8px 4px 14px 4px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:9px;line-height:0;"><img src="${BRAND_ICON_URL}" width="26" height="26" alt="${BRAND_NAME}" style="display:block;width:26px;height:26px;border:0;border-radius:13px;"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">cheapest<span style="color:#2563eb;">Go</span></td>
          </tr></table>
        </td>
        <td align="right" style="font-size:15px;font-weight:bold;color:#0f172a;letter-spacing:-0.2px;">Hello, ${firstName}</td>
      </tr>
    </table>
  </td></tr>

  <!-- Panel: amendment + CTA -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:28px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:20px;line-height:26px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">Your booking has been updated</div>
        <div style="height:12px;line-height:12px;">&nbsp;</div>
        <div style="font-size:14px;line-height:22px;color:#475569;">The changes you requested to booking <span style="font-family:'Courier New',Courier,monospace;font-weight:bold;color:#0f172a;">${escapeHtml(bookingId)}</span> were saved on <strong style="color:#0f172a;">${savedLabel}</strong>. Your booking reference has not changed.</div>
        ${manageUrl ? `
        <div style="height:22px;line-height:22px;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr><td align="center" bgcolor="#2563eb" style="border-radius:14px;">
            <a href="${manageUrl}" style="display:block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px;mso-line-height-rule:exactly;line-height:18px;">View updated booking</a>
          </td></tr>
        </table>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: what changed -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2563eb;">What changed</td></tr>
      ${diffRows.length > 0 ? `
      <tr><td class="px" style="padding:16px 28px 22px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          <tr>
            <td width="34%" style="padding:0 0 8px 0;font-size:10px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;">Item</td>
            <td width="33%" style="padding:0 0 8px 0;font-size:10px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;">Previously</td>
            <td width="33%" style="padding:0 0 8px 0;font-size:10px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;">Now</td>
          </tr>
          ${diffRows.map(row => `
          <tr>
            <td style="padding:13px 10px 13px 0;border-top:1px solid #eef2f7;color:#64748b;">${escapeHtml(row.label)}</td>
            <td style="padding:13px 10px 13px 0;border-top:1px solid #eef2f7;color:#94a3b8;text-decoration:line-through;">${escapeHtml(row.before)}</td>
            <td style="padding:13px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(row.after)}</td>
          </tr>`).join('')}
        </table>
      </td></tr>` : `
      <tr><td class="px" style="padding:10px 28px 22px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#64748b;">${escapeHtml(changes || 'Your booking details were updated.')}</td></tr>`}
    </table>
  </td></tr>

  ${hasReservation ? `
  <!-- Panel: property -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:20px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="150" class="stack stack-pad" style="width:150px;padding-right:20px;vertical-align:top;">
              <img src="${propertyImageSrc}" width="150" height="104" alt="${escapeHtml(hotelName)}" style="display:block;width:150px;height:104px;border:0;border-radius:10px;object-fit:cover;background-color:#e2e8f0;">
            </td>
            <td class="stack" style="font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
              <div style="font-size:16px;font-weight:bold;color:#0f172a;line-height:21px;">${escapeHtml(hotelName)}</div>
              <div style="height:5px;line-height:5px;">&nbsp;</div>
              <div style="font-size:13px;line-height:19px;color:#64748b;">${escapeHtml(roomName!)}</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: reservation -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#0f172a;">Reservation</td></tr>
      <tr><td class="px" style="padding:6px 28px 10px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          <tr>
            <td style="padding:14px 0;color:#64748b;">Length of stay</td>
            <td align="right" style="padding:14px 0;color:#0f172a;font-weight:bold;">1 room, ${nights} night${nights === 1 ? '' : 's'}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Check in</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${fmtLongDate(checkIn!)}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Check out</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${fmtLongDate(checkOut!)}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Lead guest</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(guestName)}</td>
          </tr>
          ${occupancyLine ? `
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Occupancy</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(occupancyLine)}</td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>` : ''}

  ${manageUrl ? `
  <!-- Panel: manage my booking -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#0f172a;">Manage my booking</td></tr>
      <tr><td class="px" style="padding:14px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#64748b;">Sign in any time to get a receipt or cancel your booking.</td></tr>
      <tr><td class="px" style="padding:22px 28px 26px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td width="50%" class="col2" style="width:50%;padding-right:16px;vertical-align:top;">
              <a href="${receiptUrl}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Download a receipt</a>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:18px;color:#94a3b8;">Get a receipt sent to you for business use.</div>
            </td>
            <td width="50%" class="col2" style="width:50%;vertical-align:top;">
              <a href="${manageUrl}" style="font-size:13px;font-weight:bold;color:#e11d48;text-decoration:none;">Cancel booking</a>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:18px;color:#94a3b8;">Cancel your booking online easily.</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td class="px" style="padding:16px 8px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;">
    This is a transactional message about booking ${escapeHtml(bookingId)}.<br>
    &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND_NAME)}. All rights reserved.<br>
    <a href="${siteUrl}/account" style="color:#64748b;text-decoration:underline;">Email preferences</a>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

export async function sendHotelAmendmentEmail(
    params: SendHotelAmendmentEmailParams
): Promise<SendBookingEmailResult> {
    const { bookingId, email, hotelName } = params;

    if (!email || !bookingId) {
        return { success: false, error: 'Missing required fields' };
    }

    try {
        const emailHtml = buildHotelAmendmentEmailHtml(params);

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
    /** Groups segments into slices (outbound vs. return) — segments sharing a value are one slice. */
    itineraryIndex?: number;
    /** e.g. 'economy' | 'premium_economy' | 'business' | 'first' */
    cabinClass?: string;
}

export interface FlightFarePolicyEmail {
    isRefundable?: boolean;
    isChangeable?: boolean;
    refundPenaltyAmount?: number | null;
    refundPenaltyCurrency?: string | null;
    changePenaltyAmount?: number | null;
    changePenaltyCurrency?: string | null;
}

export interface SendFlightBookingEmailParams {
    bookingId: string;
    pnr: string;
    email: string;
    passengerName: string;
    /** 'adult' | 'child' | 'infant' (or provider codes like 'ADT') — shown next to the passenger name. */
    passengerType?: string;
    seatNumber?: string;
    provider: string;
    segments: FlightSegmentEmail[];
    tickets?: { name: string; number: string }[];
    totalPrice: number;
    currency: string;
    farePolicy?: FlightFarePolicyEmail | null;
}

export interface SendFlightBookingEmailResult {
    success: boolean;
    error?: string;
}

/** Groups a flat segment list into slices (outbound/return legs) for the itinerary panel. */
function groupFlightSlices(segments: FlightSegmentEmail[]): FlightSegmentEmail[][] {
    if (segments.length === 0) return [];
    const slices: FlightSegmentEmail[][] = [[segments[0]]];
    for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const cur = segments[i];
        const indicesKnown = cur.itineraryIndex !== undefined && prev.itineraryIndex !== undefined;
        const indexChanged = indicesKnown && cur.itineraryIndex !== prev.itineraryIndex;
        const gapHours = (new Date(cur.departureTime).getTime() - new Date(prev.arrivalTime).getTime()) / 3_600_000;
        // A same-slice connection is a short layover; a long gap (or an itinerary index change,
        // when the caller supplied one) means we've moved to the next leg — e.g. the return flight.
        if (indexChanged || (!indicesKnown && gapHours > 24)) {
            slices.push([cur]);
        } else {
            slices[slices.length - 1].push(cur);
        }
    }
    return slices;
}

function formatDurationMinutes(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
}

/**
 * Pure render of the flight confirmation email — no I/O, no side effects.
 * Split out so it can be unit-previewed (e.g. via /api/test-email?debug=html) without
 * touching the DB or Resend.
 */
export function buildFlightConfirmationEmailHtml(params: SendFlightBookingEmailParams): string {
    const {
        bookingId, pnr, passengerName, passengerType, seatNumber, segments, tickets, totalPrice, currency, farePolicy,
    } = params;
    const flightReceiptUrl = `${env.SITE_URL}/trips/invoice/${bookingId}?type=flight`;

    const firstName = escapeHtml((passengerName || '').trim().split(/\s+/)[0] || 'there');
    const fmtMoney = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
    const formattedPrice = fmtMoney(totalPrice);

    const fmtTime = (iso: string) => {
        try {
            return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch {
            return iso;
        }
    };
    const fmtDayDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        } catch {
            return iso;
        }
    };

    const slices = groupFlightSlices(segments);

    const itineraryPanels = slices.map((slice, sliceIdx) => {
        const first = slice[0];
        const last = slice[slice.length - 1];
        const connections = slice.slice(0, -1).map((seg, i) => {
            const next = slice[i + 1];
            const layoverMins = Math.round((new Date(next.departureTime).getTime() - new Date(seg.arrivalTime).getTime()) / 60000);
            return `
              <tr>
                <td width="26" style="width:26px;vertical-align:top;padding:0;border-left:2px dotted #cbd5e1;">&nbsp;</td>
                <td style="font-family:Arial,Helvetica,sans-serif;padding:22px 0 22px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:0 10px 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0f172a;">${escapeHtml(seg.destination)}</td>
                      <td style="padding:0 0 6px 0;font-family:'Courier New',Courier,monospace;font-size:14px;color:#64748b;">${fmtTime(seg.arrivalTime)} arrive · ${escapeHtml(seg.flightNumber)}</td>
                    </tr>
                    <tr>
                      <td style="padding:0 10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0f172a;">${escapeHtml(next.origin)}</td>
                      <td style="font-family:'Courier New',Courier,monospace;font-size:14px;color:#64748b;">${fmtTime(next.departureTime)} depart · ${escapeHtml(next.flightNumber)}</td>
                    </tr>
                  </table>
                  <div style="height:8px;line-height:8px;">&nbsp;</div>
                  <div style="font-size:12px;color:#94a3b8;">${formatDurationMinutes(layoverMins)} layover in ${escapeHtml(seg.destination)}</div>
                </td>
              </tr>`;
        }).join('');

        const sliceLabel = slices.length > 1 ? `
      <tr><td class="px" bgcolor="#0f172a" style="padding:16px 28px;background-color:#0f172a;${sliceIdx === 0 ? 'border-radius:18px 18px 0 0;' : ''}font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td align="left" style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;">${sliceIdx === 0 ? 'Outbound' : 'Return'}</td>
            <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">${escapeHtml(pnr)}</td>
          </tr>
        </table>
      </td></tr>` : `
      <tr><td class="px" bgcolor="#0f172a" style="padding:16px 28px;background-color:#0f172a;border-radius:18px 18px 0 0;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td align="left" style="font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;">Confirmation</td>
            <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">${escapeHtml(pnr)}</td>
          </tr>
        </table>
      </td></tr>`;

        return `
  <!-- Panel: itinerary${slices.length > 1 ? ` (slice ${sliceIdx + 1})` : ''} -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
${sliceLabel}
      <tr><td class="px" style="padding:26px 28px 8px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="26" style="width:26px;vertical-align:top;padding:8px 0 0 0;border-left:2px dotted #cbd5e1;">
              <div style="width:12px;height:12px;margin-left:-7px;background-color:#2563eb;border-radius:6px;font-size:0;line-height:0;">&nbsp;</div>
            </td>
            <td style="font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#64748b;">Departure</div>
              <div style="height:4px;line-height:4px;">&nbsp;</div>
              <div class="iata" style="font-size:56px;line-height:60px;font-weight:bold;color:#0f172a;letter-spacing:-2px;">${escapeHtml(first.origin)}</div>
              <div style="height:4px;line-height:4px;">&nbsp;</div>
              <div style="font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:bold;color:#0f172a;">${fmtTime(first.departureTime)} ${escapeHtml(fmtDayDate(first.departureTime))} · ${escapeHtml(first.flightNumber)}</div>
              <div style="height:2px;line-height:2px;">&nbsp;</div>
              <div style="font-size:13px;color:#64748b;">${escapeHtml(first.airlineName || first.airline)}</div>
            </td>
          </tr>
${connections}
          <tr>
            <td width="26" style="width:26px;vertical-align:top;padding:0;">
              <div style="width:18px;height:18px;margin-left:-10px;border:3px solid #2563eb;border-radius:9px;box-sizing:border-box;background-color:#ffffff;font-size:0;line-height:0;">&nbsp;</div>
            </td>
            <td style="font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#64748b;">Destination</div>
              <div style="height:4px;line-height:4px;">&nbsp;</div>
              <div class="iata" style="font-size:56px;line-height:60px;font-weight:bold;color:#0f172a;letter-spacing:-2px;">${escapeHtml(last.destination)}</div>
              <div style="height:4px;line-height:4px;">&nbsp;</div>
              <div style="font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:bold;color:#0f172a;">${fmtTime(last.arrivalTime)} ${escapeHtml(fmtDayDate(last.arrivalTime))}</div>
              <div style="height:2px;line-height:2px;">&nbsp;</div>
              <div style="font-size:13px;color:#64748b;">${escapeHtml(last.airlineName || last.airline)}</div>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:14px 28px 26px 28px;line-height:0;">&nbsp;</td></tr>
    </table>
  </td></tr>`;
    }).join('');

    // Total journey time = sum of each slice's own span (excludes ground time between outbound/return).
    const totalJourneyMinutes = slices.reduce((sum, slice) => {
        const span = (new Date(slice[slice.length - 1].arrivalTime).getTime() - new Date(slice[0].departureTime).getTime()) / 60000;
        return sum + Math.max(0, Math.round(span));
    }, 0);

    // One row per ticketed passenger — primary passenger first, matching the existing tickets[] convention.
    const passengerRows = (tickets && tickets.length > 0 ? tickets : [{ name: passengerName, number: undefined as string | undefined }])
        .map((t, i) => `
          <tr>
            <td style="padding:14px 0;${i === 0 ? '' : 'border-top:1px solid #eef2f7;'}color:#64748b;">Passenger${tickets && tickets.length > 1 ? ` ${i + 1}` : ''}</td>
            <td align="right" style="padding:14px 0;${i === 0 ? '' : 'border-top:1px solid #eef2f7;'}color:#0f172a;font-weight:bold;">${escapeHtml(t.name)}${i === 0 && passengerType ? ` · ${escapeHtml(passengerType)}` : ''}</td>
          </tr>
          ${t.number ? `
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Ticket number</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#0f172a;font-weight:bold;">${escapeHtml(t.number)}</td>
          </tr>` : ''}`)
        .join('');

    const hasChangeInfo = farePolicy?.isChangeable !== undefined;
    const hasRefundInfo = farePolicy?.isRefundable !== undefined;
    const changeText = !hasChangeInfo
        ? null
        : farePolicy!.isChangeable
            ? (farePolicy!.changePenaltyAmount
                ? `Date changes are permitted for a <span style="font-family:'Courier New',Courier,monospace;color:#0f172a;">${fmtMoney(farePolicy!.changePenaltyAmount)}</span> airline fee plus any fare difference.`
                : 'Date changes are permitted; fees vary by fare — contact support for a quote.')
            : 'This fare does not permit date changes once ticketed.';
    const refundText = !hasRefundInfo
        ? null
        : farePolicy!.isRefundable
            ? (farePolicy!.refundPenaltyAmount
                ? `Refundable for a <span style="font-family:'Courier New',Courier,monospace;color:#0f172a;">${fmtMoney(farePolicy!.refundPenaltyAmount)}</span> cancellation fee.`
                : 'This fare is refundable — contact support to cancel.')
            : 'This fare is non-refundable once ticketed; government taxes generally remain refundable.';
    const policyFallback = 'Refer to your fare rules for change and refund eligibility, or contact support for details.';

    const cabinLabel = (() => {
        const raw = segments[0]?.cabinClass;
        if (!raw) return null;
        return raw.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    })();

    const hasConnection = slices.some(s => s.length > 1);
    const firstOrigin = segments[0]?.origin ?? '';
    const preheaderRoute = slices.length > 1
        ? `${segments[0]?.origin} ⇄ ${segments[segments.length - 1]?.destination}`
        : `${segments[0]?.origin} to ${segments[segments.length - 1]?.destination}`;
    const preheader = escapeHtml(`Confirmed — ${preheaderRoute}, ${fmtDayDate(segments[0]?.departureTime ?? '')}. Reference ${pnr}.`);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your flight is confirmed</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; }
    .col2 { display: block !important; width: 100% !important; padding: 0 0 22px 0 !important; }
    .iata { font-size: 46px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<span style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
<tr><td align="center" style="padding:20px 12px 32px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;">

  <!-- Masthead -->
  <tr><td class="px" style="padding:8px 4px 14px 4px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:9px;line-height:0;"><img src="${BRAND_ICON_URL}" width="26" height="26" alt="${BRAND_NAME}" style="display:block;width:26px;height:26px;border:0;border-radius:13px;"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">cheapest<span style="color:#2563eb;">Go</span></td>
          </tr></table>
        </td>
        <td align="right" style="font-size:15px;font-weight:bold;color:#0f172a;letter-spacing:-0.2px;">Hello, ${firstName}</td>
      </tr>
    </table>
  </td></tr>
${itineraryPanels}

  <!-- Panel: ticket -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:8px 28px 10px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
${passengerRows}
          ${cabinLabel ? `
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Cabin</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${escapeHtml(cabinLabel)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Seat${tickets && tickets.length > 1 ? 's' : ''}</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;color:#0f172a;font-weight:bold;">${seatNumber ? escapeHtml(seatNumber) : 'Not selected'}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;border-top:1px solid #eef2f7;color:#64748b;">Total journey time</td>
            <td align="right" style="padding:14px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#0f172a;font-weight:bold;">${formatDurationMinutes(totalJourneyMinutes)}</td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: payment -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2563eb;">Your flight is paid and ticketed</td></tr>
      <tr><td class="px" style="padding:8px 28px 4px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          <tr>
            <td style="padding:14px 0;font-size:15px;font-weight:bold;color:#0f172a;">You pay</td>
            <td align="right" style="padding:14px 0;font-family:'Courier New',Courier,monospace;font-size:17px;font-weight:bold;color:#0f172a;">${formattedPrice}</td>
          </tr>
        </table>
      </td></tr>
      ${(changeText || refundText) ? `
      <tr><td class="px" style="padding:0 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="height:1px;line-height:1px;background-color:#eef2f7;">&nbsp;</div>
        <div style="height:18px;line-height:18px;">&nbsp;</div>
        <div style="font-size:14px;font-weight:bold;color:#0f172a;">Changes and refunds</div>
        <div style="height:8px;line-height:8px;">&nbsp;</div>
        <div style="font-size:13px;line-height:21px;color:#64748b;">${changeText ?? ''}${changeText && refundText ? ' ' : ''}${refundText ?? (changeText ? '' : policyFallback)}</div>
      </td></tr>` : `
      <tr><td class="px" style="padding:0 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="height:1px;line-height:1px;background-color:#eef2f7;">&nbsp;</div>
        <div style="height:18px;line-height:18px;">&nbsp;</div>
        <div style="font-size:14px;font-weight:bold;color:#0f172a;">Changes and refunds</div>
        <div style="height:8px;line-height:8px;">&nbsp;</div>
        <div style="font-size:13px;line-height:21px;color:#64748b;">${policyFallback}</div>
      </td></tr>`}
    </table>
  </td></tr>

  <!-- Panel: get ready to go -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#0f172a;">Get ready to go</td></tr>
      <tr><td class="px" style="padding:20px 28px 26px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td width="50%" class="col2" style="width:50%;${hasConnection ? 'padding-right:18px;' : ''}vertical-align:top;">
              <div style="font-size:14px;font-weight:bold;color:#0f172a;">Arrive on time</div>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:19px;color:#94a3b8;">Be at ${escapeHtml(firstOrigin)} at least 3 hours before an international departure, or 2 hours for domestic.</div>
            </td>
            ${hasConnection ? `
            <td width="50%" class="col2" style="width:50%;vertical-align:top;">
              <div style="font-size:14px;font-weight:bold;color:#0f172a;">Connecting flight</div>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:19px;color:#94a3b8;">You have a layover along the way — allow enough time to reach your next gate.</div>
            </td>` : ''}
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: manage my booking -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#0f172a;">Manage my booking</td></tr>
      <tr><td class="px" style="padding:14px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#64748b;">Sign in any time to resend this confirmation or download a receipt.</td></tr>
      <tr><td class="px" style="padding:22px 28px 26px 28px;">
        <a href="${flightReceiptUrl}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Download a receipt</a>
        <div style="height:6px;line-height:6px;">&nbsp;</div>
        <div style="font-size:12px;line-height:18px;color:#94a3b8;">A PDF itinerary and receipt for expenses.</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td class="px" style="padding:16px 8px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;">
    This is a transactional message about booking ${escapeHtml(pnr)}.<br>
    &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND_NAME)}. All rights reserved.<br>
    <a href="${env.SITE_URL}/account" style="color:#64748b;text-decoration:underline;">Email preferences</a>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

export async function sendFlightBookingConfirmationEmail(
    params: SendFlightBookingEmailParams
): Promise<SendFlightBookingEmailResult> {
    const { bookingId, pnr, email, segments } = params;
    const route = segments[0] && segments[segments.length - 1]
        ? `${segments[0].origin} → ${segments[segments.length - 1].destination}`
        : 'N/A';

    if (!email || !bookingId) {
        return { success: false, error: 'Missing required fields' };
    }

    // Dedup: bail out immediately if this confirmation was already sent/queued
    const dup = await checkEmailDuplicate(bookingId, 'confirmation');
    if (dup) return dup;

    try {
        const emailHtml = buildFlightConfirmationEmailHtml(params);
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
        const isRoundTrip = firstSeg && lastSeg && firstSeg.origin === lastSeg.destination && segments.length > 1;
        const route = firstSeg && lastSeg
            ? isRoundTrip ? `${firstSeg.origin} ⇄ ${firstSeg.destination}` : `${firstSeg.origin} → ${lastSeg.destination}`
            : 'N/A';

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
    dbId?: string; // DB UUID — used for receipt/status links
    email: string;
    guestName: string;
    hotelName: string;
    propertyImage?: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    refundAmount: number;
    /** Cancellation fee already netted out of refundAmount — omitted (full refund) when 0/absent. */
    penaltyAmount?: number;
    currency: string;
    stripeRefundId?: string;
    cardBrand?: string;
    cardLast4?: string;
}

/**
 * Pure render of the hotel refund-issued email — no I/O, no side effects.
 * Split out so it can be unit-previewed (e.g. via /api/test-email?debug=html) without
 * touching the DB or Resend.
 */
export function buildHotelRefundEmailHtml(params: SendHotelRefundEmailParams): string {
    const {
        bookingId, dbId, guestName, hotelName, propertyImage, roomName, checkIn, checkOut,
        refundAmount, penaltyAmount, currency, stripeRefundId, cardBrand, cardLast4,
    } = params;
    const siteUrl = env.SITE_URL;
    const receiptUrl = dbId ? `${siteUrl}/trips/invoice/${dbId}?type=hotel` : null;
    const manageUrl = dbId ? `${siteUrl}/trips/${dbId}` : null;

    const nights = Math.max(1, calculateNights(checkIn, checkOut));
    const firstName = escapeHtml((guestName || '').trim().split(/\s+/)[0] || 'there');

    const fmtMoney = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency || 'PHP' }).format(n);
    const formattedRefund = fmtMoney(refundAmount);

    const fmtShortDate = (dateStr: string) => {
        try {
            return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        } catch {
            return dateStr;
        }
    };
    const checkOutYear = (() => {
        try {
            return new Date(`${checkOut}T00:00:00`).getFullYear();
        } catch {
            return new Date().getFullYear();
        }
    })();

    const hasCard = !!(cardBrand && cardLast4);
    const cardLabel = hasCard ? `${escapeHtml(cardBrand)} ending <span style="font-family:'Courier New',Courier,monospace;">${escapeHtml(cardLast4)}</span>` : 'your original payment method';

    const hasCharge = !!penaltyAmount && penaltyAmount > 0;
    const totalPaid = refundAmount + (penaltyAmount ?? 0);

    const issuedLabel = new Date().toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const preheader = escapeHtml(`Refund of ${fmtMoney(refundAmount)} issued for booking ${bookingId} — ${hotelName}.`);
    const propertyImageSrc = escapeHtml(propertyImage) || PROPERTY_PLACEHOLDER_URL;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your refund has been issued</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; }
    .stack-pad { padding: 0 0 18px 0 !important; }
    .col2 { display: block !important; width: 100% !important; padding: 0 0 18px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<span style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
<tr><td align="center" style="padding:20px 12px 32px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;">

  <!-- Masthead -->
  <tr><td class="px" style="padding:8px 4px 14px 4px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:9px;line-height:0;"><img src="${BRAND_ICON_URL}" width="26" height="26" alt="${BRAND_NAME}" style="display:block;width:26px;height:26px;border:0;border-radius:13px;"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">cheapest<span style="color:#2563eb;">Go</span></td>
          </tr></table>
        </td>
        <td align="right" style="font-size:15px;font-weight:bold;color:#0f172a;letter-spacing:-0.2px;">Hello, ${firstName}</td>
      </tr>
    </table>
  </td></tr>

  <!-- Panel: refund issued -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:28px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:20px;line-height:26px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">Your refund has been issued</div>
        <div style="height:12px;line-height:12px;">&nbsp;</div>
        <div style="font-size:14px;line-height:22px;color:#475569;">We've sent <strong style="color:#0f172a;">${formattedRefund}</strong> back to your ${cardLabel} for cancelled booking <span style="font-family:'Courier New',Courier,monospace;font-weight:bold;color:#0f172a;">${escapeHtml(bookingId)}</span>. Your bank will post it to your statement within 5–10 business days.</div>
        ${receiptUrl ? `
        <div style="height:22px;line-height:22px;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr><td align="center" bgcolor="#2563eb" style="border-radius:14px;">
            <a href="${receiptUrl}" style="display:block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px;mso-line-height-rule:exactly;line-height:18px;">Download refund receipt</a>
          </td></tr>
        </table>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: refund summary -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2563eb;">Refund summary</td></tr>
      <tr><td class="px" style="padding:8px 28px 4px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          ${hasCharge ? `
          <tr>
            <td style="padding:12px 0;border-top:1px solid #eef2f7;color:#64748b;">Total paid</td>
            <td align="right" style="padding:12px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#0f172a;">${fmtMoney(totalPaid)}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-top:1px solid #eef2f7;color:#64748b;">Cancellation charge</td>
            <td align="right" style="padding:12px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#e11d48;">− ${fmtMoney(penaltyAmount!)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:14px 0;${hasCharge ? 'border-top:1px solid #e2e8f0;' : ''}font-size:15px;font-weight:bold;color:#0f172a;">Refunded to your card</td>
            <td align="right" style="padding:14px 0;${hasCharge ? 'border-top:1px solid #e2e8f0;' : ''}font-family:'Courier New',Courier,monospace;font-size:17px;font-weight:bold;color:#16a34a;">${formattedRefund}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td class="px" style="padding:0 28px 24px 28px;">
        <div style="height:1px;line-height:1px;background-color:#eef2f7;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          ${stripeRefundId ? `
          <tr>
            <td style="padding:16px 0 6px 0;color:#64748b;">Refund reference</td>
            <td align="right" style="padding:16px 0 6px 0;font-family:'Courier New',Courier,monospace;color:#0f172a;font-weight:bold;">${escapeHtml(stripeRefundId)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;">Issued</td>
            <td align="right" style="padding:6px 0;color:#0f172a;font-weight:bold;">${issuedLabel}</td>
          </tr>
          ${hasCard ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;">Method</td>
            <td align="right" style="padding:6px 0;color:#0f172a;font-weight:bold;">${cardLabel}</td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Panel: cancelled stay -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:20px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="150" class="stack stack-pad" style="width:150px;padding-right:20px;vertical-align:top;">
              <img src="${propertyImageSrc}" width="150" height="104" alt="${escapeHtml(hotelName)}" style="display:block;width:150px;height:104px;border:0;border-radius:10px;object-fit:cover;background-color:#e2e8f0;">
            </td>
            <td class="stack" style="font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
              <div style="font-size:16px;font-weight:bold;color:#0f172a;line-height:21px;">${escapeHtml(hotelName)}</div>
              <div style="height:5px;line-height:5px;">&nbsp;</div>
              <div style="font-size:13px;line-height:19px;color:#64748b;">${escapeHtml(roomName)} · 1 room, ${nights} night${nights === 1 ? '' : 's'}</div>
              <div style="font-size:13px;line-height:19px;color:#64748b;">${fmtShortDate(checkIn)} – ${fmtShortDate(checkOut)} ${checkOutYear} · ${escapeHtml(guestName)}</div>
              <div style="height:8px;line-height:8px;">&nbsp;</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#fff1f2" style="border-radius:999px;padding:5px 11px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#e11d48;">Cancelled · refunded</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  ${manageUrl ? `
  <!-- Panel: next steps -->
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
      <tr><td class="px" style="padding:24px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#0f172a;">If the refund hasn't arrived</td></tr>
      <tr><td class="px" style="padding:14px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#64748b;">Banks post refunds on their own schedule.${stripeRefundId ? ` Quote refund reference <span style="font-family:'Courier New',Courier,monospace;font-weight:bold;color:#0f172a;">${escapeHtml(stripeRefundId)}</span> if you need to check with them.` : ''}</td></tr>
      <tr><td class="px" style="padding:22px 28px 26px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td width="50%" class="col2" style="width:50%;padding-right:16px;vertical-align:top;">
              <a href="${receiptUrl}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Download refund receipt</a>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:18px;color:#94a3b8;">A PDF showing the refunded amount and date, for your bank or expenses.</div>
            </td>
            <td width="50%" class="col2" style="width:50%;vertical-align:top;">
              <a href="${manageUrl}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Track refund status</a>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:18px;color:#94a3b8;">See where the refund is in your account any time.</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td class="px" style="padding:16px 8px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;">
    This is a transactional message about booking ${escapeHtml(bookingId)}.<br>
    &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND_NAME)}. All rights reserved.<br>
    <a href="${siteUrl}/account" style="color:#64748b;text-decoration:underline;">Email preferences</a>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

export async function sendHotelRefundEmail(params: SendHotelRefundEmailParams): Promise<{ success: boolean; error?: string }> {
    const { bookingId, email, hotelName, refundAmount, currency } = params;
    if (!email || !bookingId) return { success: false, error: 'Missing required fields' };

    const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
    const emailHtml = buildHotelRefundEmailHtml(params);

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
