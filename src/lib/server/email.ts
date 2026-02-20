import { createClient } from '@supabase/supabase-js';

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
        <p style="margin: 0 0 20px 0;">Dear <strong>${guestName}</strong>,</p>

        <p style="margin: 0 0 20px 0;">Thank you for your booking! Your reservation has been confirmed.</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #374151;">Booking Details</h2>

            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Booking ID:</td>
                    <td style="padding: 8px 0; font-weight: 600; font-family: monospace;">${bookingId}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Property:</td>
                    <td style="padding: 8px 0; font-weight: 600;">${hotelName}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Room:</td>
                    <td style="padding: 8px 0;">${roomName}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Check-in:</td>
                    <td style="padding: 8px 0;">${checkIn}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Check-out:</td>
                    <td style="padding: 8px 0;">${checkOut}</td>
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
                        from: 'CheapestGo <onboarding@resend.dev>',
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
                        <strong>${seg.airlineName || seg.airline}</strong><br>
                        <span style="color: #6b7280; font-size: 13px;">${seg.flightNumber}</span>
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                        <strong>${seg.origin}</strong><br>
                        <span style="color: #6b7280; font-size: 13px;">${depStr}</span>
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #9ca3af;">→</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                        <strong>${seg.destination}</strong><br>
                        <span style="color: #6b7280; font-size: 13px;">${arrStr}</span>
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
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${route}</p>
    </div>

    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="margin: 0 0 20px 0;">Dear <strong>${passengerName}</strong>,</p>

        <p style="margin: 0 0 20px 0;">Your flight has been booked successfully. Here are your booking details:</p>

        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #374151;">Booking Details</h2>

            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">PNR:</td>
                    <td style="padding: 8px 0; font-weight: 700; font-family: monospace; font-size: 18px; color: #4f46e5;">${pnr}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Booking ID:</td>
                    <td style="padding: 8px 0; font-weight: 600; font-family: monospace;">${bookingId}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
                    <td style="padding: 8px 0; text-transform: capitalize;">${provider}</td>
                </tr>
                ${tickets && tickets.length > 0 ? `
                <tr style="border-top: 1px solid #e5e7eb;">
                    <td style="padding: 12px 0 8px 0; color: #6b7280; font-weight: 600; vertical-align: top;">E-Tickets:</td>
                    <td style="padding: 12px 0 8px 0;">
                        ${tickets.map(t => `<div style="margin-bottom: 4px"><span style="color:#4f46e5;font-weight:600;font-family:monospace;">${t.number}</span> <span style="font-size:12px;color:#6b7280;">- ${t.name}</span></div>`).join('')}
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
                Please save your PNR (<strong>${pnr}</strong>) for check-in and reference.
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
                from: 'CheapestGo <onboarding@resend.dev>',
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
