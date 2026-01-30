import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface BookingEmailRequest {
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

export async function POST(request: NextRequest) {
    try {
        const body: BookingEmailRequest = await request.json();

        const { bookingId, email, guestName, hotelName, roomName, checkIn, checkOut, totalPrice, currency } = body;

        if (!email || !bookingId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

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
            This email was sent by AeroVantage Travel<br>
            &copy; ${new Date().getFullYear()} All rights reserved
        </p>
    </div>
</body>
</html>
        `;

        // Create Supabase client if keys are available
        const supabase = supabaseUrl && supabaseServiceKey
            ? createClient(supabaseUrl, supabaseServiceKey)
            : null;

        // Store email record in database (if Supabase is configured)
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
                console.error('Failed to store email record:', dbError);
                // Don't fail - the booking was still successful
            }
        }

        // Try to send via Resend if API key is available
        const resendApiKey = process.env.RESEND_API_KEY;
        console.log('=== Email Send Attempt ===');
        console.log('Resend API Key configured:', !!resendApiKey);
        console.log('Sending to:', email);

        if (resendApiKey) {
            try {
                const resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: 'AeroVantage <onboarding@resend.dev>',
                        to: [email],
                        subject: `Booking Confirmed - ${hotelName}`,
                        html: emailHtml,
                    }),
                });

                const resendData = await resendResponse.json();
                console.log('Resend Response Status:', resendResponse.status);
                console.log('Resend Response Data:', JSON.stringify(resendData, null, 2));

                if (resendResponse.ok) {
                    // Update email status to sent (if Supabase is configured)
                    if (supabase) {
                        await supabase
                            .from('booking_emails')
                            .update({ status: 'sent' })
                            .eq('booking_id', bookingId);
                    }

                    console.log('✅ Email sent successfully via Resend!');
                    return NextResponse.json({ success: true, method: 'resend', id: resendData.id });
                } else {
                    console.error('❌ Resend API Error:', resendData);
                }
            } catch (resendError) {
                console.error('❌ Resend fetch failed:', resendError);
            }
        } else {
            console.log('⚠️ No Resend API key configured');
        }

        // Return success even if email sending is queued (booking is complete)
        return NextResponse.json({
            success: true,
            method: supabase ? 'queued' : 'logged',
            message: 'Booking confirmed. Email confirmation will be sent shortly.'
        });

    } catch (error: any) {
        console.error('Email API Error:', error);
        return NextResponse.json(
            { error: 'Failed to process email request', details: error.message },
            { status: 500 }
        );
    }
}
