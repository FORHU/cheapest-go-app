import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rate-limit';
import { formatCurrency, calculateNights } from '@/lib/utils';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { InvoicePdfDocument } from './InvoicePdfDocument';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoice/[id]/pdf?type=flight|hotel
 * 
 * Generates a proper PDF receipt and returns it as a downloadable file.
 * Mirrors the data-fetching logic of the invoice page but renders via @react-pdf/renderer.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const type = req.nextUrl.searchParams.get('type') || 'flight';

    // This is the same receipt the page at /trips/invoice/[id] renders, in another file
    // format, so it answers to the same Capability Link: possession of the UUID is the
    // authorisation (ADR-0027), and no session is required. It used to demand one and
    // scope the row to the caller, which meant "Download PDF" failed for exactly the
    // people the emailed link is for — a guest opening their receipt signed out, or
    // anyone the booker forwarded it to. The session is still read, to fill in the
    // viewer's email when the booking itself carries none.
    const { user } = await getAuthenticatedUser().catch(() => ({ user: null, error: null }));

    // Rendering a PDF is real CPU on the request path, and this endpoint is now reachable
    // without a session, so it carries its own limit. Generous per person — a receipt is
    // downloaded once or twice, and a legitimate reader never counts.
    const rl = await rateLimit(req, {
        limit: 20,
        windowMs: 60_000,
        prefix: 'invoice-pdf',
        ...(user ? { userId: user.id } : {}),
    });
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const db = createAdminClient();

    const isHotel = type === 'hotel';
    let booking: any = null;

    // ── Fetch booking from the appropriate table ──
    // UUID only. The page dropped its supplier-`booking_id` fallback for being a weaker
    // way in to the same data (ADR-0027, rule 2); this route has to match, or the rule
    // is enforced on one of the two URLs that serve the receipt.
    if (isHotel) {
        const { data: byUuid } = await db.from('bookings').select('*').eq('id', id).single();
        booking = byUuid;
    } else {
        const { data } = await db.from('flight_bookings').select('*, flight_segments(*), passengers(*)').eq('id', id).single();
        booking = data;
    }

    // Fallback: unified_bookings
    if (!booking) {
        const { data: unified } = await db.from('unified_bookings').select('*').eq('id', id).single();

        if (unified) {
            const meta = unified.metadata as any;
            const isBundle = ['bundle', 'hotel_bundle'].includes(unified.type);
            
            // Map unified_bookings shape
            if (unified.type === 'hotel' || isBundle) {
                booking = {
                    ...booking,
                    id: unified.id,
                    created_at: unified.created_at,
                    total_price: unified.total_price,
                    currency: unified.currency,
                    status: unified.status,
                    property_name: meta?.property_name || meta?.hotelName || meta?.hotel_name || 'Hotel Stay',
                    room_name: meta?.room_name || meta?.roomName || meta?.room_type || '',
                    check_in: meta?.check_in || meta?.checkIn || '',
                    check_out: meta?.check_out || meta?.checkOut || '',
                    guests_adults: meta?.guests?.adults ?? meta?.guests_adults ?? 1,
                    guests_children: meta?.guests?.children ?? meta?.guests_children ?? 0,
                    holder_first_name: meta?.holder?.firstName || meta?.holder_first_name || '',
                    holder_last_name: meta?.holder?.lastName || meta?.holder_last_name || '',
                    holder_email: meta?.holder?.email || meta?.holder_email || meta?.contact_email || '',
                    booking_id: unified.external_id || unified.id.slice(0, 8).toUpperCase(),
                    type: unified.type,
                    user_id: unified.user_id // Added user_id mapping
                };
            }

            if (unified.type === 'flight' || isBundle) {
                const segments = meta?.segments || meta?.flight_segments || [];
                const passengers = meta?.passengers || [];
                booking = {
                    ...booking,
                    id: unified.id,
                    created_at: unified.created_at,
                    total_price: unified.total_price,
                    currency: unified.currency,
                    status: unified.status,
                    pnr: meta?.pnr || unified.external_id || '',
                    provider: unified.provider,
                    trip_type: meta?.trip_type || meta?.tripType || 'one-way',
                    flight_segments: segments.map((s: any) => ({
                        airline: s.airline || s.airlineName || '',
                        flight_number: s.flight_number || s.flightNumber || '',
                        origin: s.origin || s.departure_airport || '',
                        destination: s.destination || s.arrival_airport || '',
                        departure: s.departure || s.departureTime || s.departure_time || '',
                    })),
                    passengers: passengers.map((p: any) => ({
                        first_name: p.firstName || p.first_name || '',
                        last_name: p.lastName || p.last_name || '',
                        type: p.type || 'ADT',
                        ticket_number: p.ticketNumber || p.ticket_number || '',
                    })),
                    type: unified.type,
                    user_id: unified.user_id // Added user_id mapping
                };
            }
        }
    }

    if (!booking) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const isBundleType = ['bundle', 'hotel_bundle'].includes(booking.type || type);
    const effectiveIsHotel = isHotel || isBundleType;
    const effectiveIsFlight = (type === 'flight') || isBundleType;

    // ── Resolve customer email ──
    // Prefer the booking owner's own address, exactly as the receipt page does — a
    // forwarded receipt should bill to the person who booked, not to whoever opened it.
    let customerEmail = user?.email || '';
    if (!isHotel && booking.user_id) {
        try {
            const { data: ownerProfile } = await db
                .from('profiles')
                .select('email')
                .eq('id', booking.user_id)
                .single();
            if (ownerProfile?.email) customerEmail = ownerProfile.email;
        } catch (err) {
            console.error('Failed to fetch booking owner profile:', err);
            // Non-critical: customerEmail falls back to the viewer's own address
        }
    }

    // ── Prepare data for the PDF ──
    const invoiceNumber = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
    const issuedDate = new Date(booking.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
    const currency = booking.currency || 'PHP';
    const totalPrice = Number(booking.total_price || booking.charged_price || 0);

    const billedTo = effectiveIsHotel
        ? {
            name: `${booking.holder_first_name || ''} ${booking.holder_last_name || ''}`.trim() || `${booking.passengers?.[0]?.first_name || ''} ${booking.passengers?.[0]?.last_name || ''}`.trim(),
            email: booking.holder_email || customerEmail || '',
        }
        : {
            name: `${booking.passengers?.[0]?.first_name || ''} ${booking.passengers?.[0]?.last_name || ''}`.trim(),
            email: customerEmail,
        };

    const formattedTotal = formatCurrency(totalPrice, currency);

    // Hotel details
    let hotelDetails: any = null;
    if (effectiveIsHotel) {
        const nights = booking.check_in && booking.check_out
            ? calculateNights(new Date(booking.check_in), new Date(booking.check_out))
            : 0;
        const checkInFmt = booking.check_in
            ? new Date(booking.check_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';
        const checkOutFmt = booking.check_out
            ? new Date(booking.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';

        hotelDetails = {
            propertyName: booking.property_name || '',
            roomName: booking.room_name || '',
            dates: `${checkInFmt} -> ${checkOutFmt}`,
            nights,
            guests: `${booking.guests_adults} adult${booking.guests_adults !== 1 ? 's' : ''}${
                booking.guests_children > 0 ? `, ${booking.guests_children} child${booking.guests_children !== 1 ? 'ren' : ''}` : ''
            }`,
        };
    }

    // Flight details
    let flightDetails: any = null;
    if (effectiveIsFlight) {
        flightDetails = {
            segments: (booking.flight_segments ?? []).map((seg: any) => ({
                airline: `${seg.airline || ''} ${seg.flight_number || ''}`.trim(),
                route: `${seg.origin || ''} -> ${seg.destination || ''}`,
                date: seg.departure
                    ? new Date(seg.departure).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '',
            })),
            passengers: (booking.passengers ?? []).map((p: any) => ({
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                type: p.type || 'ADT',
                ticketNumber: p.ticket_number || '',
            })),
        };
    }

    const bookingRef = isHotel ? (booking.booking_id || '') : (booking.pnr || '');
    const bookingType = isBundleType ? 'Flight + Hotel Bundle' : isHotel ? 'Hotel' : `Flight · ${booking.trip_type ?? 'one-way'}`;
    const provider = isHotel ? 'Hotel Partner' : (booking.provider || '');

    // ── Render the PDF to Buffer ──
    const pdfBuffer = await renderToBuffer(
        React.createElement(InvoicePdfDocument, {
            invoiceNumber,
            issuedDate,
            billedTo,
            isHotel: effectiveIsHotel,
            hotelDetails,
            flightDetails,
            bookingRef,
            bookingType,
            provider,
            formattedTotal,
        }) as any
    );

    const filename = `CheapestGo-Receipt-${invoiceNumber}.pdf`;

        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(pdfBuffer.length),
            },
        });
    } catch (error: any) {
        console.error('PDF Generation Error:', error);
        return NextResponse.json({
            error: 'Detailed PDF generation failed',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}
