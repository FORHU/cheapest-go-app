import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createAdminClient } from '@/utils/supabase/admin';
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

    const { user, supabase, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    const isAdmin = profile?.role === 'admin';
    const db = isAdmin ? createAdminClient() : supabase;

    const isHotel = type === 'hotel';
    let booking: any = null;

    // ── Fetch booking from the appropriate table ──
    if (isHotel) {
        let query = db.from('bookings').select('*').eq('id', id);
        if (!isAdmin) query = query.eq('user_id', user.id);
        const { data: byUuid } = await query.single();

        if (byUuid) {
            booking = byUuid;
        } else {
            let fallbackQuery = db.from('bookings').select('*').eq('booking_id', id);
            if (!isAdmin) fallbackQuery = fallbackQuery.eq('user_id', user.id);
            const { data: byBookingId } = await fallbackQuery.single();
            booking = byBookingId;
        }
    } else {
        let query = db.from('flight_bookings').select('*, flight_segments(*), passengers(*)').eq('id', id);
        if (!isAdmin) query = query.eq('user_id', user.id);
        const { data } = await query.single();
        booking = data;
    }

    // Fallback: unified_bookings
    if (!booking) {
        let uQuery = db.from('unified_bookings').select('*').eq('id', id);
        if (!isAdmin) uQuery = uQuery.eq('user_id', user.id);
        const { data: unified } = await uQuery.single();

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
    let customerEmail = user.email || '';
    if (isAdmin && !isHotel && booking.user_id) {
        try {
            const { data: ownerProfile } = await db
                .from('profiles')
                .select('email')
                .eq('id', booking.user_id)
                .single();
            if (ownerProfile?.email) customerEmail = ownerProfile.email;
        } catch (err) {
            console.error('Failed to fetch owner profile for admin:', err);
            // Non-critical: customerEmail remains admin's email as fallback
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
