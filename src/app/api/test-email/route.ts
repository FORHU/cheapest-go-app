import { NextResponse } from 'next/server';
import {
    sendBookingConfirmationEmail,
    sendHotelCancellationEmail,
    sendHotelAmendmentEmail
} from '@/lib/server/email';

/**
 * Test endpoint for email templates
 * GET /api/test-email?recipient=your@email.com
 *
 * NOTE: Remove this file before deploying to production!
 */
export async function GET(req: Request) {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const recipient = searchParams.get('recipient');
    const type = searchParams.get('type') || 'confirmation'; // confirmation, cancellation, amendment

    if (!recipient) {
        return NextResponse.json({
            error: 'Missing recipient',
            usage: '/api/test-email?recipient=your@email.com&type=confirmation'
        }, { status: 400 });
    }

    // Sample booking data
    const sampleBooking = {
        bookingId: 'TEST-' + Date.now(),
        propertyName: 'Grand Manila Hotel',
        propertyImage: 'https://static.cupid.travel/hotel-placeholder.jpg',
        propertyAddress: 'Makati Avenue, Makati City, Metro Manila, Philippines',
        roomName: 'Deluxe Suite with City View',
        checkIn: '2026-05-15',
        checkOut: '2026-05-18',
        adults: 2,
        children: 1,
        totalPrice: 15000,
        currency: 'PHP',
        holderFirstName: 'Test',
        holderLastName: 'User',
        holderEmail: recipient,
        specialRequests: 'Late check-in requested (after 10 PM)',
        cancellationPolicy: {
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                {
                    cancelTime: '2026-05-10T00:00:00Z',
                    amount: 0,
                    currency: 'PHP',
                    type: 'AMOUNT'
                }
            ]
        }
    };

    try {
        let result;

        switch (type) {
            case 'confirmation':
                result = await sendBookingConfirmationEmail({
                    bookingId: sampleBooking.bookingId,
                    email: recipient,
                    guestName: `${sampleBooking.holderFirstName} ${sampleBooking.holderLastName}`,
                    hotelName: sampleBooking.propertyName,
                    roomName: sampleBooking.roomName,
                    checkIn: sampleBooking.checkIn,
                    checkOut: sampleBooking.checkOut,
                    totalPrice: sampleBooking.totalPrice,
                    currency: sampleBooking.currency
                });
                break;

            case 'cancellation':
                result = await sendHotelCancellationEmail({
                    bookingId: sampleBooking.bookingId,
                    email: recipient,
                    guestName: `${sampleBooking.holderFirstName} ${sampleBooking.holderLastName}`,
                    hotelName: sampleBooking.propertyName,
                    roomName: sampleBooking.roomName,
                    checkIn: sampleBooking.checkIn,
                    checkOut: sampleBooking.checkOut,
                    refundAmount: sampleBooking.totalPrice,
                    currency: sampleBooking.currency,
                    refundStatus: 'processed'
                });
                break;

            case 'amendment':
                result = await sendHotelAmendmentEmail({
                    bookingId: sampleBooking.bookingId,
                    email: recipient,
                    guestName: `${sampleBooking.holderFirstName} ${sampleBooking.holderLastName}`,
                    hotelName: sampleBooking.propertyName,
                    changes: 'Guest name and special requests updated'
                });
                break;

            default:
                return NextResponse.json({
                    error: 'Invalid type',
                    validTypes: ['confirmation', 'cancellation', 'amendment']
                }, { status: 400 });
        }

        return NextResponse.json({
            success: result.success,
            message: result.success
                ? `Test ${type} email sent to ${recipient}! Check your inbox.`
                : 'Email failed to send',
            error: result.error,
            bookingId: sampleBooking.bookingId,
            type
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
