import { NextResponse } from 'next/server';
import {
    sendBookingConfirmationEmail,
    sendHotelCancellationEmail,
    sendHotelAmendmentEmail,
    sendHotelRefundEmail,
    sendFlightBookingConfirmationEmail,
    sendFlightAwaitingTicketEmail,
    sendFlightCancellationEmail,
    sendFlightRefundEmail,
    sendFlightCancellationRefundEmail,
    sendFlightAmendmentEmail,
    buildHotelConfirmationEmailHtml,
    buildHotelRefundEmailHtml,
    buildHotelAmendmentEmailHtml,
    buildHotelCancellationEmailHtml,
    buildFlightConfirmationEmailHtml,
    buildFlightAwaitingTicketEmailHtml,
    buildFlightCancellationEmailHtml,
    buildFlightRefundEmailHtml,
    buildFlightCancellationRefundEmailHtml,
    buildFlightAmendmentEmailHtml,
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

    // Real hotel data, pulled directly from the ETG (worldota.net) B2B API via curl:
    //   curl -X POST https://api.worldota.net/api/b2b/v3/hotel/info/ \
    //     -H "Authorization: Basic <base64(ETG_KEY_ID:ETG_API_KEY)>" \
    //     -d '{"id":"inter_city_seoul","language":"en"}'
    //   curl -X POST https://api.worldota.net/api/b2b/v3/search/serp/hotels/ \
    //     -H "Authorization: Basic <base64(ETG_KEY_ID:ETG_API_KEY)>" \
    //     -d '{"ids":["inter_city_seoul"],"checkin":"2026-10-15","checkout":"2026-10-18","guests":[{"adults":2}],"currency":"USD","language":"en","residency":"us"}'
    // Hotel: Inter City Seoul (ETG id "inter_city_seoul", hid 8479183), 4-star, real
    // address/image/room name/price from that response — baked in as a static sample so
    // this endpoint doesn't depend on a live TGX/ETG call or local hotel_content cache at
    // request time.
    const sampleBooking = {
        bookingId: 'TEST-' + Date.now(),
        propertyName: 'Inter City Seoul',
        propertyImage: 'https://cdn.worldota.net/t/1024x768/content/98/f8/98f8cc66f065e824c7c600a4488b660f4a8882c9.jpeg',
        propertyAddress: '76-3, Magokjungang 6-ro, Seoul',
        propertyCity: 'Seoul',
        propertyCountry: 'South Korea',
        starRating: 4,
        checkInTime: '14:00',
        checkOutTime: '12:00',
        roomName: 'Deluxe Double Room with Kitchen',
        checkIn: '2026-10-15',
        checkOut: '2026-10-18',
        adults: 2,
        children: 0,
        totalPrice: 438,
        discountAmount: 20,
        currency: 'USD',
        holderFirstName: 'Test',
        holderLastName: 'User',
        holderEmail: recipient,
        specialRequests: 'Late check-in requested (after 10 PM)',
        cancellationPolicy: {
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                {
                    cancelTime: '2026-10-10T15:00:00Z',
                    amount: 0,
                    currency: 'USD',
                    type: 'AMOUNT'
                },
                {
                    cancelTime: '2026-10-12T15:00:00Z',
                    amount: 438,
                    currency: 'USD',
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
        refundAmount: sampleBooking.totalPrice - 50,
        penaltyAmount: 50,
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
        dbId: searchParams.get('dbId') || undefined,
        email: recipient,
        guestName: `${sampleBooking.holderFirstName} ${sampleBooking.holderLastName}`,
        hotelName: sampleBooking.propertyName,
        propertyImage: sampleBooking.propertyImage,
        propertyCity: sampleBooking.propertyCity,
        propertyCountry: sampleBooking.propertyCountry,
        starRating: sampleBooking.starRating,
        roomName: sampleBooking.roomName,
        checkIn: sampleBooking.checkIn,
        checkOut: sampleBooking.checkOut,
        totalPrice: sampleBooking.totalPrice,
        refundAmount: cancellationRefundStatus === 'non_refundable' ? undefined : sampleBooking.totalPrice - 50,
        penaltyAmount: cancellationRefundStatus === 'non_refundable' ? undefined : 50,
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

    const flightAwaitingTicketParams = {
        bookingId: flightConfirmationParams.bookingId,
        pnr: flightConfirmationParams.pnr,
        email: recipient,
        passengerName: flightConfirmationParams.passengerName,
        segments: flightConfirmationParams.segments,
        totalPrice: flightConfirmationParams.totalPrice,
        currency: flightConfirmationParams.currency,
    };

    // flightRefundStatus overridable via query param to preview both cancellation-refund
    // panel variants: ?flightRefundStatus=refundable (default) | non_refundable
    const flightRefundStatus = searchParams.get('flightRefundStatus') || 'refundable';
    const flightPenalty = 3400; // matches farePolicy.changePenaltyAmount above, for a consistent story
    const flightCancellationParams = {
        bookingId: flightConfirmationParams.bookingId,
        pnr: flightConfirmationParams.pnr,
        email: recipient,
        passengerName: flightConfirmationParams.passengerName,
        segments: flightConfirmationParams.segments,
        totalPaid: flightConfirmationParams.totalPrice,
        refundAmount: flightRefundStatus === 'non_refundable' ? 0 : flightConfirmationParams.totalPrice - flightPenalty,
        penaltyAmount: flightRefundStatus === 'non_refundable' ? 0 : flightPenalty,
        currency: flightConfirmationParams.currency,
    };

    const flightRefundParams = {
        bookingId: flightConfirmationParams.bookingId,
        pnr: flightConfirmationParams.pnr,
        email: recipient,
        passengerName: flightConfirmationParams.passengerName,
        segments: flightConfirmationParams.segments,
        totalPrice: flightConfirmationParams.totalPrice,
        currency: flightConfirmationParams.currency,
        refundId: 're_3TestFlightRefund0001',
    };

    const flightCancellationRefundParams = {
        bookingId: flightConfirmationParams.bookingId,
        pnr: flightConfirmationParams.pnr,
        email: recipient,
        passengerName: flightConfirmationParams.passengerName,
        route: flightConfirmationParams.segments[0] && flightConfirmationParams.segments[flightConfirmationParams.segments.length - 1]
            ? `${flightConfirmationParams.segments[0].origin} → ${flightConfirmationParams.segments[flightConfirmationParams.segments.length - 1].destination}`
            : 'N/A',
        refundAmount: flightConfirmationParams.totalPrice - flightPenalty,
        currency: flightConfirmationParams.currency,
        stripeRefundId: 're_3TestFlightCancelRefund0001',
    };

    const flightAmendmentParams = {
        bookingId: flightConfirmationParams.bookingId,
        pnr: flightConfirmationParams.pnr,
        email: recipient,
        passengerName: flightConfirmationParams.passengerName,
        segments: flightConfirmationParams.segments,
        seatNumber: searchParams.get('seat') || '14C',
        remarks: 'Vegetarian meal requested',
        changes: 'Passenger name, seat',
        previous: {
            passengerName: 'Maria S. Reyez',
            seatNumber: undefined,
            remarks: null,
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
    if (searchParams.get('debug') === 'html' && type === 'flight-awaiting-ticket') {
        return new NextResponse(buildFlightAwaitingTicketEmailHtml(flightAwaitingTicketParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'flight-cancellation') {
        return new NextResponse(buildFlightCancellationEmailHtml(flightCancellationParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'flight-refund') {
        return new NextResponse(buildFlightRefundEmailHtml(flightRefundParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'flight-cancellation-refund') {
        return new NextResponse(buildFlightCancellationRefundEmailHtml(flightCancellationRefundParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'flight-amendment') {
        return new NextResponse(buildFlightAmendmentEmailHtml(flightAmendmentParams), {
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

            case 'flight-awaiting-ticket':
                result = await sendFlightAwaitingTicketEmail(flightAwaitingTicketParams);
                break;

            case 'flight-cancellation':
                result = await sendFlightCancellationEmail(flightCancellationParams);
                break;

            case 'flight-refund':
                result = await sendFlightRefundEmail(flightRefundParams);
                break;

            case 'flight-cancellation-refund':
                result = await sendFlightCancellationRefundEmail(flightCancellationRefundParams);
                break;

            case 'flight-amendment':
                result = await sendFlightAmendmentEmail(flightAmendmentParams);
                break;

            default:
                return NextResponse.json({
                    error: 'Invalid type',
                    validTypes: [
                        'confirmation', 'cancellation', 'amendment', 'refund', 'flight', 'flight-awaiting-ticket',
                        'flight-cancellation', 'flight-refund', 'flight-cancellation-refund', 'flight-amendment',
                    ]
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
