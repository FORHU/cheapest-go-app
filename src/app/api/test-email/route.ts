import { NextResponse } from 'next/server';
import { tgxGraphQL, getTgxSettings, getTgxConfig, getTgxFilterSearch } from '@/lib/server/stays/travelgatex/client';
import { getSqlAdmin } from '@/lib/db/postgres';
import {
    sendBookingConfirmationEmail,
    sendHotelCancellationEmail,
    sendHotelAmendmentEmail,
    sendHotelRefundEmail,
    sendFlightBookingConfirmationEmail,
    sendFlightAwaitingTicketEmail,
    sendFlightRefundEmail,
    sendFlightCancellationEmail,
    sendFlightCancellationRefundEmail,
    sendPriceAlertConfirmationEmail,
    sendPriceAlertEmail,
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

    const flightAwaitingParams = {
        bookingId: sampleBooking.bookingId,
        pnr: 'CG-6500500050',
        email: recipient,
        passengerName: 'Maria S. Reyes',
        segments: [
            {
                airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR 424',
                origin: 'MNL', destination: 'ICN',
                departureTime: '2026-09-10T21:36:00Z', arrivalTime: '2026-09-11T01:15:00Z',
                itineraryIndex: 0, cabinClass: 'economy',
            },
        ],
        totalPrice: 22502.40,
        currency: 'PHP',
    };

    const priceAlertConfirmationParams = {
        email: recipient,
        origin: 'MNL',
        destination: 'NRT',
        cabin: 'economy',
        adults: 2,
        alertId: 'alert-test-001',
        targetPrice: 18000,
        currency: 'PHP',
    };

    const priceAlertParams = {
        email: recipient,
        origin: 'MNL',
        destination: 'NRT',
        newPrice: 14500,
        oldPrice: 18000,
        currency: 'PHP',
        cabin: 'economy',
        adults: 2,
        searchUrl: 'https://cheapestgo.com/search?origin=MNL&destination=NRT',
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
            originTerminal: '2', destinationTerminal: '1',
        },
        {
            airline: 'KE', airlineName: 'Korean Air', flightNumber: 'KE 705',
            origin: 'ICN', destination: 'NRT',
            departureTime: '2026-09-11T04:05:00Z', arrivalTime: '2026-09-11T06:25:00Z',
            itineraryIndex: 0, cabinClass: 'economy',
            originTerminal: '2', destinationTerminal: '1',
        },
    ];
    const returnSegments: FlightSegmentEmail[] = [
        {
            airline: 'PR', airlineName: 'Philippine Airlines', flightNumber: 'PR 421',
            origin: 'NRT', destination: 'MNL',
            departureTime: '2026-09-18T08:40:00Z', arrivalTime: '2026-09-18T12:55:00Z',
            itineraryIndex: 1, cabinClass: 'economy',
            originTerminal: '1', destinationTerminal: '2',
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
    const flightCancellationHtmlParams = {
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

    const flightRefundHtmlParams = {
        bookingId: flightConfirmationParams.bookingId,
        pnr: flightConfirmationParams.pnr,
        email: recipient,
        passengerName: flightConfirmationParams.passengerName,
        segments: flightConfirmationParams.segments,
        totalPrice: flightConfirmationParams.totalPrice,
        currency: flightConfirmationParams.currency,
        refundId: 're_3TestFlightRefund0001',
    };

    const flightCancellationRefundHtmlParams = {
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
        return new NextResponse(buildFlightCancellationEmailHtml(flightCancellationHtmlParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'flight-refund') {
        return new NextResponse(buildFlightRefundEmailHtml(flightRefundHtmlParams), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
    if (searchParams.get('debug') === 'html' && type === 'flight-cancellation-refund') {
        return new NextResponse(buildFlightCancellationRefundEmailHtml(flightCancellationRefundHtmlParams), {
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

            case 'flight-awaiting':
                result = await sendFlightAwaitingTicketEmail(flightAwaitingParams);
                break;

            // Sent and previewed from the same objects. `sendFlightRefundEmail` and
            // friends take exactly the type their `build…Html` counterpart takes — the
            // sender calls the builder — so a second near-identical set of params only
            // made the preview show something other than what was actually sent.
            case 'flight-refund':
                result = await sendFlightRefundEmail(flightRefundHtmlParams);
                break;

            case 'flight-cancellation':
                result = await sendFlightCancellationEmail(flightCancellationHtmlParams);
                break;

            case 'flight-cancellation-refund':
                result = await sendFlightCancellationRefundEmail(flightCancellationRefundHtmlParams);
                break;

            case 'price-alert-confirmation':
                result = await sendPriceAlertConfirmationEmail(priceAlertConfirmationParams);
                break;

            case 'price-alert':
                result = await sendPriceAlertEmail(priceAlertParams);
                break;

            case 'real-hotel': {
                // Pull a real hotel from hotel_content DB and combine with a live TGX search.
                // If TGX search for the specific hotel returns no results (OTV inventory gap),
                // fall back to DB-sourced content + typical rate data — the email template
                // renders identically either way, letting us verify all UI at production quality.
                const checkin = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
                const checkout = new Date(Date.now() + 16 * 86400_000).toISOString().slice(0, 10);

                const sql = getSqlAdmin();
                const dbHotelId = searchParams.get('hotelId') || '6808729';

                // Try DB first for content
                let rows = await sql`
                    SELECT name, images, star_rating, review_rating, review_count,
                           address, city, country, check_in_time, check_out_time
                    FROM hotel_content WHERE hotel_id = ${dbHotelId} LIMIT 1`;

                // If specific hotel not in DB, pick any well-seeded hotel
                if (!rows[0]) {
                    rows = await sql`
                        SELECT hotel_id, name, images, star_rating, review_rating, review_count,
                               address, city, country, check_in_time, check_out_time
                        FROM hotel_content
                        WHERE name IS NOT NULL AND name != ''
                          AND images IS NOT NULL AND jsonb_array_length(images) > 0
                          AND star_rating >= 4
                        ORDER BY review_count DESC NULLS LAST
                        LIMIT 1`;
                }
                const content = rows[0] ?? {};

                // Attempt live TGX search for real rate data
                let roomDesc = 'Deluxe Double Room';
                let price = 185.00;
                let currency2 = 'USD';
                let policy: any = {
                    refundableTag: 'RFN',
                    cancelPolicyInfos: [{
                        cancelTime: new Date(Date.now() + 7 * 86400_000).toISOString(),
                        amount: 0,
                        currency: 'USD',
                        type: 'AMOUNT',
                    }],
                };

                try {
                    const cfg = getTgxConfig();
                    const HOTEL_SEARCH_Q = `
                      query TgxHotelSearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput!, $filterSearch: HotelXFilterSearchInput) {
                        hotelX {
                          search(criteria: $criteria, settings: $settings, filterSearch: $filterSearch) {
                            options {
                              id hotelCode boardCode paymentType status
                              price { currency net gross }
                              rooms { occupancyRefId code description }
                              cancelPolicy {
                                refundable
                                cancelPenalties { deadline hoursBefore penaltyType currency value }
                              }
                            }
                            errors { code type description }
                          }
                        }
                      }`;
                    const searchResult = await tgxGraphQL(HOTEL_SEARCH_Q, {
                        criteria: {
                            checkIn: checkin,
                            checkOut: checkout,
                            occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }],
                            nationality: 'KR',
                            currency: 'USD',
                            hotels: [dbHotelId],
                        },
                        settings: getTgxSettings(cfg, 12_000, false, 'USD'),
                        filterSearch: getTgxFilterSearch(cfg),
                    }, 15_000);

                    const options: any[] = searchResult?.data?.hotelX?.search?.options ?? [];
                    const refundable = options
                        .filter(o => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK') && o.cancelPolicy?.refundable)
                        .sort((a: any, b: any) => (a.price.gross || a.price.net) - (b.price.gross || b.price.net));
                    const picked = refundable[0] ?? options.filter(o => o.paymentType === 'MERCHANT')[0];
                    if (picked) {
                        roomDesc = (picked.rooms ?? [])[0]?.description ?? roomDesc;
                        price = picked.price.gross ?? picked.price.net ?? price;
                        currency2 = picked.price.currency ?? currency2;
                        policy = picked.cancelPolicy?.refundable
                            ? {
                                refundableTag: 'RFN',
                                cancelPolicyInfos: (picked.cancelPolicy?.cancelPenalties ?? []).map((p: any) => ({
                                    cancelTime: p.deadline ?? new Date().toISOString(),
                                    amount: p.value ?? 0,
                                    currency: p.currency ?? currency2,
                                    type: p.penaltyType ?? 'AMOUNT',
                                })),
                            }
                            : { refundableTag: 'NRF', cancelPolicyInfos: [] };
                    }
                } catch {
                    // TGX search failed — use fallback rate data above
                }

                const img = Array.isArray(content.images) ? content.images[0] : undefined;

                result = await sendBookingConfirmationEmail({
                    bookingId: `REAL-${dbHotelId}-${Date.now()}`,
                    email: recipient,
                    guestName: 'Test Guest',
                    hotelName: content.name ?? dbHotelId,
                    roomName: roomDesc,
                    checkIn: checkin,
                    checkOut: checkout,
                    totalPrice: price,
                    currency: currency2,
                    propertyImage: typeof img === 'string' ? img : undefined,
                    propertyAddress: content.address ?? undefined,
                    propertyCity: content.city ?? undefined,
                    propertyCountry: content.country ?? undefined,
                    starRating: content.star_rating ?? undefined,
                    reviewRating: content.review_rating ?? undefined,
                    reviewCount: content.review_count ?? undefined,
                    checkInTime: content.check_in_time ?? undefined,
                    checkOutTime: content.check_out_time ?? undefined,
                    adults: 2,
                    cancellationPolicy: policy,
                });

                return NextResponse.json({
                    success: result.success,
                    message: result.success
                        ? `Real hotel email sent to ${recipient}! Hotel: ${content.name ?? dbHotelId}, ${currency2} ${price}`
                        : 'Email failed',
                    error: result.error,
                    hotelUsed: { id: dbHotelId, name: content.name, city: content.city, roomDesc, price, currency: currency2 },
                });
            }

            default:
                return NextResponse.json({
                    error: 'Invalid type',
                    validTypes: ['confirmation', 'cancellation', 'amendment', 'refund', 'flight',
                        'flight-awaiting', 'flight-refund', 'flight-cancellation',
                        'flight-cancellation-refund', 'price-alert-confirmation', 'price-alert',
                        'real-hotel']
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
