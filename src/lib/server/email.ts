import { createClient } from '@supabase/supabase-js';

// ─── HTML Escaping (prevent XSS in email templates) ─────────────────

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ═════════════════════════════════════════════════════════════════════
//  HOTEL BOOKING EMAIL
// ═════════════════════════════════════════════════════════════════════

export interface SendBookingEmailParams {
    bookingId: string;
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
    const { bookingId, email, guestName, hotelName, roomName, checkIn, checkOut, totalPrice, currency } = params;

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

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        const resendApiKey = process.env.RESEND_API_KEY;

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
                        subject: `Booking Confirmed - ${hotelName}`,
                        html: emailHtml,
                    }),
                });

                if (resendResponse.ok) {
                    // Update email status to sent
                    if (supabase) {
                        await supabase
                            .from('booking_emails')
                            .update({ status: 'sent' })
                            .eq('booking_id', bookingId);
                    }
                    return { success: true };
                }
            } catch (resendError) {
                console.error('[sendBookingConfirmationEmail] Resend failed:', resendError);
            }
        }

        // Return success even if email sending is queued
        return { success: true };
    } catch (error) {
        console.error('[sendBookingConfirmationEmail] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send email',
        };
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

        // Try to send via Resend if API key is available
        const resendApiKey = process.env.RESEND_API_KEY;

        console.log('[sendFlightBookingConfirmationEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const payload = {
                from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
                to: [email],
                subject: `Flight Booking Confirmed - PNR ${pnr} (${route})`,
                html: emailHtml,
            };

            console.log('[sendFlightBookingConfirmationEmail] Resend payload (to):', payload.to, '| subject:', payload.subject);

            const resendResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const responseText = await resendResponse.text();
            console.log('[sendFlightBookingConfirmationEmail] Resend response:', resendResponse.status, responseText);

            if (resendResponse.ok) {
                return { success: true };
            }

            return { success: false, error: `Resend ${resendResponse.status}: ${responseText}` };
        }

        console.warn('[sendFlightBookingConfirmationEmail] RESEND_API_KEY not set — email not sent');
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

        const resendApiKey = process.env.RESEND_API_KEY;
        console.log('[sendFlightAwaitingTicketEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
                    to: [email],
                    subject: `Booking Received – PNR ${pnr} (${route}) — E-Ticket Pending`,
                    html: emailHtml,
                }),
            });
            const text = await res.text();
            console.log('[sendFlightAwaitingTicketEmail] Resend response:', res.status, text);
            if (res.ok) return { success: true };
            return { success: false, error: `Resend ${res.status}: ${text}` };
        }

        console.warn('[sendFlightAwaitingTicketEmail] RESEND_API_KEY not set');
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

        const resendApiKey = process.env.RESEND_API_KEY;
        console.log('[sendFlightRefundEmail] Sending to:', email, '| PNR:', pnr);

        if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
                    to: [email],
                    subject: `Refund Initiated – ${route} (PNR ${pnr})`,
                    html: emailHtml,
                }),
            });
            const text = await res.text();
            console.log('[sendFlightRefundEmail] Resend response:', res.status, text);
            if (res.ok) return { success: true };
            return { success: false, error: `Resend ${res.status}: ${text}` };
        }

        console.warn('[sendFlightRefundEmail] RESEND_API_KEY not set');
        return { success: false, error: 'RESEND_API_KEY not configured' };
    } catch (error) {
        console.error('[sendFlightRefundEmail] Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
    }
}
