import { NextResponse } from 'next/server';
import {
    sendBookingConfirmationEmail,
    sendHotelCancellationEmail,
    sendHotelAmendmentEmail,
    sendHotelRefundEmail,
    sendFlightBookingConfirmationEmail,
    buildHotelConfirmationEmailHtml,
    buildHotelRefundEmailHtml,
    buildHotelAmendmentEmailHtml,
    buildHotelCancellationEmailHtml,
    buildFlightConfirmationEmailHtml,
    type FlightSegmentEmail
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
        propertyAddress: '123 Makati Avenue, San Antonio',
        propertyCity: 'Makati City',
        propertyCountry: 'Philippines',
        starRating: 4,
        reviewRating: 4.6,
        reviewCount: 812,
        checkInTime: '15:00',
        checkOutTime: '12:00',
        roomName: 'Deluxe Suite with City View',
        checkIn: '2026-05-15',
        checkOut: '2026-05-18',
        adults: 2,
        children: 1,
        totalPrice: 15000,
        discountAmount: 500,
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

    const confirmationParams = {
        bookingId: sampleBooking.bookingId,
        dbId: searchParams.get('dbId') || undefined,
        email: recipient,
        guestName: `${sampleBooking.holderFirstName} ${sampleBooking.holderLastName}`,
        hotelName: sampleBooking.propertyName,
        roomName: sampleBooking.roomName,
        checkIn: sampleBooking.checkIn,
        checkOut: sampleBooking.checkOut,
        totalPrice: sampleBooking.totalPrice,
        currency: sampleBooking.currency,
        propertyImage: sampleBooking.propertyImage,
        propertyAddress: sampleBooking.propertyAddress,
        propertyCity: sampleBooking.propertyCity,
        propertyCountry: sampleBooking.propertyCountry,
        starRating: sampleBooking.starRating,
        reviewRating: sampleBooking.reviewRating,
        reviewCount: sampleBooking.reviewCount,
        checkInTime: sampleBooking.checkInTime,
        checkOutTime: sampleBooking.checkOutTime,
        adults: sampleBooking.adults,
        children: sampleBooking.children,
        discountAmount: sampleBooking.discountAmount,
        cancellationPolicy: sampleBooking.cancellationPolicy,
    };

    const refundParams = {
        bookingId: sampleBooking.bookingId,
        dbId: searchParams.get('dbId') || undefined,
        email: recipient,
        guestName: `${sampleBooking.holderFirstName} ${sampleBooking.holderLastName}`,
        hotelName: sampleBooking.propertyName,
        propertyImage: sampleBooking.propertyImage,
        roomName: sampleBooking.roomName,
        checkIn: sampleBooking.checkIn,
        checkOut: sampleBooking.checkOut,
        refundAmount: sampleBooking.totalPrice - 750,
        penaltyAmount: 750,
        currency: sampleBooking.currency,
        stripeRefundId: 're_3TestRefund00000001',
        cardBrand: 'Visa',
        cardLast4: '4417',
    };

    const amendmentParams = {
        bookingId: sampleBooking.bookingId,
        dbId: searchParams.get('dbId') || undefined,
        email: recipient,
        guestName: 'Test S. User',
        hotelName: sampleBooking.propertyName,
        propertyImage: sampleBooking.propertyImage,
        roomName: sampleBooking.roomName,
        checkIn: sampleBooking.checkIn,
        checkOut: sampleBooking.checkOut,
        adults: sampleBooking.adults,
        children: sampleBooking.children,
        remarks: 'Late check-in requested (after 11 PM)',
        changes: 'Guest name, special requests',
        previous: {
            firstName: sampleBooking.holderFirstName,
            lastName: sampleBooking.holderLastName,
            email: sampleBooking.holderEmail,
            remarks: sampleBooking.specialRequests,
        },
    };

    // refundStatus overridable via query param to preview all three refund-panel variants:
    // ?refundStatus=processed (default) | failed | non_refundable
    const cancellationRefundStatus = searchParams.get('refundStatus') || 'processed';
    const cancellationParams = {
        bookingId: sampleBooking.bookingId,
        email: recipient,
        guestName: `${sampleBooking.holderFirstName} ${sampleBooking.holderLastName}`,
        hotelName: sampleBooking.propertyName,
        propertyImage: sampleBooking.propertyImage,
        propertyCity: sampleBooking.propertyCity,
        propertyCountry: sampleBooking.propertyCountry,
        starRating: sampleBooking.starRating,
        reviewRating: sampleBooking.reviewRating,
        reviewCount: sampleBooking.reviewCount,
        roomName: sampleBooking.roomName,
        checkIn: sampleBooking.checkIn,
        checkOut: sampleBooking.checkOut,
        totalPrice: sampleBooking.totalPrice,
        refundAmount: cancellationRefundStatus === 'non_refundable' ? undefined : sampleBooking.totalPrice - 750,
        penaltyAmount: cancellationRefundStatus === 'non_refundable' ? undefined : 750,
        currency: sampleBooking.currency,
        refundStatus: cancellationRefundStatus,
        cancellationRef: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
    };

    // flightType overridable via query param: ?flightType=oneway (default) | roundtrip
    const flightType = searchParams.get('flightType') || 'oneway';
    // Times below are given in UTC ('Z') — matching what a real DB round-trip through a
    // `timestamptz` column actually returns (Postgres does not preserve the original
    // per-airport offset; see the note on time display in the flight email builder).
    const outboundSegments: FlightSegmentEmail[] = [
        {
            airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR 424',
            origin: 'MNL', destination: 'ICN',
            departureTime: '2026-09-10T21:36:00Z', arrivalTime: '2026-09-11T01:15:00Z',
            itineraryIndex: 0, cabinClass: 'economy',
        },
        {
            airline: 'KE', airlineName: 'Korean Air', flightNumber: 'KE 705',
            origin: 'ICN', destination: 'NRT',
            departureTime: '2026-09-11T04:05:00Z', arrivalTime: '2026-09-11T06:25:00Z',
            itineraryIndex: 0, cabinClass: 'economy',
        },
    ];
    const returnSegments: FlightSegmentEmail[] = [
        {
            airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR 421',
            origin: 'NRT', destination: 'MNL',
            departureTime: '2026-09-18T08:40:00Z', arrivalTime: '2026-09-18T12:55:00Z',
            itineraryIndex: 1, cabinClass: 'economy',
        },
    ];
    const flightConfirmationParams = {
        bookingId: sampleBooking.bookingId,
        pnr: 'CG-6500500050',
        email: recipient,
        passengerName: 'Maria S. Reyes',
        passengerType: 'adult',
        seatNumber: searchParams.get('seat') || undefined,
        provider: 'duffel',
        segments: flightType === 'roundtrip' ? [...outboundSegments, ...returnSegments] : outboundSegments,
        tickets: [{ name: 'Maria S. Reyes', number: '079-2244118903' }],
        totalPrice: 22502.40,
        currency: 'PHP',
        farePolicy: {
            isRefundable: false,
            isChangeable: true,
            changePenaltyAmount: 3400,
            changePenaltyCurrency: 'PHP',
        },
    };

    // Render-only mode: returns the generated HTML directly for visual inspection in a
    // browser, without touching the DB or Resend. GET /api/test-email?debug=html&type=confirmation
    if (searchParams.get('debug') === 'html' && type === 'confirmation') {
        return new NextResponse(buildHotelConfirmationEmailHtml(confirmationParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'refund') {
        return new NextResponse(buildHotelRefundEmailHtml(refundParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'amendment') {
        return new NextResponse(buildHotelAmendmentEmailHtml(amendmentParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'cancellation') {
        return new NextResponse(buildHotelCancellationEmailHtml(cancellationParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'flight') {
        return new NextResponse(buildFlightConfirmationEmailHtml(flightConfirmationParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    try {
        let result;

        switch (type) {
            case 'confirmation':
                result = await sendBookingConfirmationEmail(confirmationParams);
                break;

            case 'cancellation':
                result = await sendHotelCancellationEmail(cancellationParams);
                break;

            case 'amendment':
                result = await sendHotelAmendmentEmail(amendmentParams);
                break;

            case 'refund':
                result = await sendHotelRefundEmail(refundParams);
                break;

            case 'flight':
                result = await sendFlightBookingConfirmationEmail(flightConfirmationParams);
                break;

            default:
                return NextResponse.json({
                    error: 'Invalid type',
                    validTypes: ['confirmation', 'cancellation', 'amendment', 'refund', 'flight']
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
