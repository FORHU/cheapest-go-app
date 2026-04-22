import { createClient } from '@supabase/supabase-js';
import { env } from "@/utils/env";

// ─── HTML Escaping (prevent XSS in email templates) ─────────────────

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Email Logging ────────────────────────────────────────────────────

export type EmailLogStatus = 'queued' | 'sent' | 'failed';
export type EmailType = 'confirmation' | 'ticketed' | 'refund' | 'cancellation' | 'awaiting_ticket' | 'price_alert';

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
}) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.warn('[logEmail] Supabase credentials not found');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
            error_message: params.errorMessage,
            metadata,
            sent_at: params.status === 'sent' ? new Date().toISOString() : null
        }]);

    if (error) {
        console.error('[logEmail] Failed to insert log:', error);
    }
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
}

export interface SendBookingEmailResult {
    success: boolean;
    error?: string;
}

export async function sendBookingConfirmationEmail(
    params: SendBookingEmailParams
): Promise<SendBookingEmailResult> {
    const { bookingId, dbId, email, guestName, hotelName, roomName, checkIn, checkOut, totalPrice, currency } = params;
    const siteUrl = env.SITE_URL;
    const receiptUrl = dbId ? `${siteUrl}/trips/invoice/${dbId}?type=hotel` : null;

    if (!email || !bookingId) {
        return { success: false, error: 'Missing required fields' };
    }

    try {
        // Format price
        const formattedPrice = new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: currency || 'PHP',
        }).format(totalPrice);

        // Build email HTML content
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Booking Confirmed!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your reservation is all set</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="margin: 0 0 20px 0;">Dear <strong>${escapeHtml(guestName)}</strong>,</p>

        <p style="margin: 0 0 20px 0;">Thank you for your booking! Your reservation has been confirmed.</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #374151;">Booking Details</h2>

            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Booking ID:</td>
                    <td style="padding: 8px 0; font-weight: 600; font-family: monospace;">${escapeHtml(bookingId)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Property:</td>
                    <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(hotelName)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Room:</td>
                    <td style="padding: 8px 0;">${escapeHtml(roomName)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Check-in:</td>
                    <td style="padding: 8px 0;">${escapeHtml(checkIn)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Check-out:</td>
                    <td style="padding: 8px 0;">${escapeHtml(checkOut)}</td>
                </tr>
                <tr style="border-top: 1px solid #e5e7eb;">
                    <td style="padding: 12px 0 8px 0; color: #6b7280; font-weight: 600;">Total:</td>
                    <td style="padding: 12px 0 8px 0; font-weight: 700; font-size: 18px; color: #059669;">${formattedPrice}</td>
                </tr>
            </table>
        </div>

        <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0; color: #065f46; font-size: 14px;">
                <strong>What's next?</strong><br>
                You'll receive additional details from the property closer to your check-in date.
            </p>
        </div>

        ${receiptUrl ? `
        <div style="text-align: center; margin: 24px 0 8px 0;">
            <a href="${receiptUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;">
                View / Download Receipt
            </a>
        </div>` : ''}

        <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px;">
            If you have any questions, please don't hesitate to contact us.
        </p>
    </div>

    <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
            This email was sent by CheapestGo<br>
            &copy; ${new Date().getFullYear()} All rights reserved
        </p>
    </div>
</body>
</html>
    `;

        const supabaseUrl = env.SUPABASE_URL;
        const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

        // Create Supabase client if keys are available
        const supabase = supabaseUrl && supabaseServiceKey
            ? createClient(supabaseUrl, supabaseServiceKey)
            : null;

        // Store email record in database
        if (supabase) {
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
                        from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
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

        const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Booking Cancelled</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#64748b 0%,#475569 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:28px;">Booking Cancelled</h1>
    <p style="color:rgba(255,255,255,0.9);margin:10px 0 0 0;">${escapeHtml(hotelName)}</p>
  </div>
  <div style="background:#ffffff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
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
  </div>
  <div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p>
  </div>
</body>
</html>`;

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
                        from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
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
        const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Booking Updated</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#2563eb 0%,#4f46e5 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:28px;">Booking Updated</h1>
    <p style="color:rgba(255,255,255,0.9);margin:10px 0 0 0;">${escapeHtml(hotelName)}</p>
  </div>
  <div style="background:#ffffff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
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
  </div>
  <div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p>
  </div>
</body>
</html>`;

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
                        from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
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

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flight Booking Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Flight Booking Confirmed!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${escapeHtml(route)}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
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
    </div>

    <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
            This email was sent by CheapestGo<br>
            &copy; ${new Date().getFullYear()} All rights reserved
        </p>
    </div>
</body>
</html>
        `;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Flight Booking Confirmed - PNR ${pnr} (${route})`;
        console.log('[sendFlightBookingConfirmationEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const payload = {
                from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
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

        const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Booking Received</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#d97706 0%,#b45309 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:28px;">✈️ Booking Confirmed</h1>
        <p style="color:rgba(255,255,255,0.9);margin:10px 0 0 0;">E-Ticket Pending — ${escapeHtml(route)}</p>
    </div>
    <div style="background:#ffffff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
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
    </div>
    <div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p>
    </div>
</body>
</html>`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Booking Received – PNR ${pnr} (${route}) — E-Ticket Pending`;
        console.log('[sendFlightAwaitingTicketEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
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

        const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Refund Initiated</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#475569 0%,#334155 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:28px;">Booking Update</h1>
        <p style="color:rgba(255,255,255,0.85);margin:10px 0 0 0;">Refund Initiated — ${escapeHtml(route)}</p>
    </div>
    <div style="background:#ffffff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
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
    </div>
    <div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p>
    </div>
</body>
</html>`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Refund Initiated – ${route} (PNR ${pnr})`;
        console.log('[sendFlightRefundEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
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

        const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Booking Cancelled</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#64748b 0%,#475569 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:28px;">Booking Cancelled</h1>
    <p style="color:rgba(255,255,255,0.9);margin:10px 0 0 0;">${escapeHtml(route)}</p>
  </div>
  <div style="background:#ffffff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
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
  </div>
  <div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p>
  </div>
</body>
</html>`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Booking Cancelled – PNR ${pnr} (${route})`;
        console.log('[sendFlightCancellationEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
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

        const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Refund Confirmed</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:28px;">✅ Refund Confirmed</h1>
    <p style="color:rgba(255,255,255,0.9);margin:10px 0 0 0;">${escapeHtml(route)}</p>
  </div>
  <div style="background:#ffffff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
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

    <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px;">Thank you for choosing CheapestGo. We hope to serve you again soon.</p>
  </div>
  <div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p>
  </div>
</body>
</html>`;

        const resendApiKey = env.RESEND_API_KEY;
        const subject = `Refund Confirmed – ${fmt(refundAmount)} for PNR ${pnr}`;
        console.log('[sendFlightCancellationRefundEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
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

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Refund Confirmed</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:28px;">✅ Refund Confirmed</h1>
    <p style="color:rgba(255,255,255,0.9);margin:10px 0 0 0;">${escapeHtml(hotelName)}</p>
  </div>
  <div style="background:#ffffff;padding:30px;border:1px solid #e5e7eb;border-top:none;">
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

    <p style="margin:20px 0 0 0;color:#6b7280;font-size:14px;">Thank you for choosing CheapestGo. We hope to see you again soon.</p>
  </div>
  <div style="background:#f9fafb;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by CheapestGo<br>&copy; ${new Date().getFullYear()} All rights reserved</p>
  </div>
</body>
</html>`;

    const resendApiKey = env.RESEND_API_KEY;
    const subject = `Refund Confirmed – ${fmt(refundAmount)} for ${hotelName}`;

    try {
        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: 'CheapestGo <no-reply@mail.cheapestgo.com>', to: [email], subject, html: emailHtml }),
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

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
  <h1 style="color:white;margin:0;font-size:24px;">Price Alert Active! ✈️</h1>
  <p style="color:rgba(255,255,255,0.9);margin:8px 0 0">${escapeHtml(origin)} &rarr; ${escapeHtml(destination)}</p>
</div>
<div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
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
</div>
<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">
  &copy; ${new Date().getFullYear()} CheapestGo. All rights reserved.
</div>
</body></html>`;

    if (!resendApiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

    const subject = `Watching prices: ${origin} \u2192 ${destination}`;

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'CheapestGo Alerts <no-reply@mail.cheapestgo.com>',
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

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#10b981,#059669);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
  <h1 style="color:white;margin:0;font-size:24px;">Price Drop Alert! 📉</h1>
  <p style="color:rgba(255,255,255,0.9);margin:8px 0 0">${escapeHtml(origin)} &rarr; ${escapeHtml(destination)}</p>
</div>
<div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
  <p style="margin:0 0 20px">Great news! The price for your tracked route has ${drop && drop > 0 ? `dropped by <strong>${drop}%</strong>` : 'changed'}.</p>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 20px;text-align:center;">
    ${formattedOld ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-decoration:line-through;">${escapeHtml(formattedOld)}</p>` : ''}
    <p style="margin:0;font-size:32px;font-weight:800;color:#059669;">${escapeHtml(formattedNew)}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${adults} adult${adults > 1 ? 's' : ''} &middot; ${escapeHtml(cabinLabel)}</p>
  </div>
  <a href="${escapeHtml(searchUrl)}" style="display:block;background:#059669;color:white;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;font-weight:700;font-size:16px;margin:0 0 20px">Book Now</a>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">Prices change frequently. This fare may not be available when you search.</p>
</div>
</body></html>`;

    if (!resendApiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

    const subject = `Price drop: ${origin} \u2192 ${destination} now ${formattedNew}`;

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'CheapestGo Alerts <alerts@mail.cheapestgo.com>',
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
