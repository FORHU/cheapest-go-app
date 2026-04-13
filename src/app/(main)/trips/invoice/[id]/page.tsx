import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createAdminClient } from '@/utils/supabase/admin';
import { formatCurrency, calculateNights } from '@/lib/utils';
import { PrintButton } from './PrintButton';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ type?: string }>;
}

export default async function InvoicePage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { type } = await searchParams;

    const { user, supabase, error: authError } = await getAuthenticatedUser();
    if (authError || !user) redirect('/login');

    // Check if viewer is an admin — admins can view any customer's receipt
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    const isAdmin = profile?.role === 'admin';

    // Use admin client (bypasses RLS) for admin users, regular client for customers
    const db = isAdmin ? createAdminClient() : supabase;

    const isHotel = type === 'hotel';

    let booking: any = null;

    if (isHotel) {
        // Hotels: id param may be DB UUID or external booking_id
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

    // Fallback: check unified_bookings (newer bookings live here)
    if (!booking) {
        let uQuery = db.from('unified_bookings').select('*').eq('id', id);
        if (!isAdmin) uQuery = uQuery.eq('user_id', user.id);
        const { data: unified } = await uQuery.single();

        if (unified) {
            const meta = unified.metadata as any;
            // Map unified_bookings shape to the format the invoice renderer expects
            if (unified.type === 'hotel') {
                booking = {
                    id: unified.id,
                    created_at: unified.created_at,
                    total_price: unified.total_price,
                    currency: unified.currency,
                    status: unified.status,
                    // Hotel fields from metadata
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
                    _isUnified: true,
                };
            } else {
                // Flight from unified_bookings
                const segments = meta?.segments || meta?.flight_segments || [];
                const passengers = meta?.passengers || [];
                booking = {
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
                    _isUnified: true,
                };
            }
        }
    }

    if (!booking) notFound();

    const invoiceNumber = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
    const issuedDate = new Date(booking.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
    const currency = booking.currency || 'PHP';
    const totalPrice = booking.total_price;

    // Resolve customer email for the "Billed to" section
    // For hotels it comes from the booking record; for flights we need the booking owner's email
    let customerEmail = user.email;
    if (isAdmin && !isHotel && booking.user_id) {
        const { data: ownerProfile } = await db
            .from('profiles')
            .select('email')
            .eq('id', booking.user_id)
            .single();
        if (ownerProfile?.email) customerEmail = ownerProfile.email;
    }


    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 py-8 px-4">
            {/* Print button — hidden when printing */}
            <div className="max-w-3xl mx-auto mb-4 flex justify-end print:hidden">
                <PrintButton />
            </div>

            {/* Invoice */}
            <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-lg print:shadow-none print:rounded-none">
                {/* Header */}
                <div className="flex items-start justify-between px-8 pt-8 pb-6 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h1 className="text-2xl font-extrabold text-indigo-600 tracking-tight">CheapestGo</h1>
                        <p className="text-xs text-slate-400 mt-0.5">Your Travel Partner</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-bold text-slate-800 dark:text-white">RECEIPT</p>
                        <p className="text-xs text-slate-400 mt-0.5">{invoiceNumber}</p>
                        <p className="text-xs text-slate-400">Issued: {issuedDate}</p>
                    </div>
                </div>

                {/* Billed to */}
                <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Billed to</p>
                    {isHotel ? (
                        <>
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                {booking.holder_first_name} {booking.holder_last_name}
                            </p>
                            <p className="text-xs text-slate-500">{booking.holder_email}</p>
                        </>
                    ) : (
                        <>
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                {booking.passengers?.[0]?.first_name} {booking.passengers?.[0]?.last_name}
                            </p>
                            <p className="text-xs text-slate-500">{customerEmail}</p>
                        </>
                    )}
                </div>

                {/* Booking details */}
                <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Booking Details</p>

                    {isHotel ? (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                                    <th className="text-left pb-2 font-medium">Description</th>
                                    <th className="text-right pb-2 font-medium">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                <tr>
                                    <td className="py-3">
                                        <p className="font-semibold text-slate-800 dark:text-white">{booking.property_name}</p>
                                        <p className="text-xs text-slate-500">{booking.room_name}</p>
                                        <p className="text-xs text-slate-500">
                                            {new Date(booking.check_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {' → '}
                                            {new Date(booking.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {' · '}
                                            {calculateNights(new Date(booking.check_in), new Date(booking.check_out))} nights
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {booking.guests_adults} adult{booking.guests_adults !== 1 ? 's' : ''}
                                            {booking.guests_children > 0 && `, ${booking.guests_children} child${booking.guests_children !== 1 ? 'ren' : ''}`}
                                        </p>
                                    </td>
                                    <td className="py-3 text-right font-semibold text-slate-800 dark:text-white">
                                        {formatCurrency(totalPrice, currency)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                                    <th className="text-left pb-2 font-medium">Flight</th>
                                    <th className="text-left pb-2 font-medium">Route</th>
                                    <th className="text-left pb-2 font-medium">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {(booking.flight_segments ?? []).map((seg: any, i: number) => (
                                    <tr key={i}>
                                        <td className="py-2.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                                            {seg.airline} {seg.flight_number}
                                        </td>
                                        <td className="py-2.5 text-xs text-slate-600 dark:text-slate-300">
                                            {seg.origin} → {seg.destination}
                                        </td>
                                        <td className="py-2.5 text-xs text-slate-500">
                                            {new Date(seg.departure).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Passengers for flights */}
                    {!isHotel && booking.passengers?.length > 0 && (
                        <div className="mt-4">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Passengers</p>
                            <div className="space-y-1">
                                {booking.passengers.map((p: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                                        <span>{p.first_name} {p.last_name} <span className="text-slate-400">({p.type})</span></span>
                                        {p.ticket_number && (
                                            <span className="font-mono text-emerald-600 dark:text-emerald-400 text-[10px]">E-TKT: {p.ticket_number}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Booking reference */}
                <div className="px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-6 text-xs text-slate-500">
                    <div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Booking Ref</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                            {isHotel ? booking.booking_id : booking.pnr}
                        </span>
                    </div>
                    <div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Type</span>
                        <span className="text-slate-700 dark:text-slate-300 capitalize">
                            {isHotel ? 'Hotel' : `Flight · ${booking.trip_type ?? 'one-way'}`}
                        </span>
                    </div>
                    <div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Provider</span>
                        <span className="text-slate-700 dark:text-slate-300 capitalize">
                            {isHotel ? 'Hotel Partner' : booking.provider}
                        </span>
                    </div>
                    <div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Payment</span>
                        <span className="text-slate-700 dark:text-slate-300">Stripe (Card)</span>
                    </div>
                </div>

                {/* Total */}
                <div className="px-8 py-5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-500">Total Paid</p>
                    <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                        {formatCurrency(totalPrice, currency)}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-8 pb-8">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-5 py-4 text-xs text-slate-400 text-center">
                        Thank you for booking with CheapestGo. For support, contact{' '}
                        <span className="text-indigo-500">crm@myfarebox.com</span>
                    </div>
                </div>
            </div>

            <style>{`
                @media print {
                    /* Hide everything on the page by default */
                    body > * { display: none !important; }

                    /* Show only the root wrapper that contains the invoice */
                    body > div { display: block !important; }

                    /* Hide header, footer, nav, dev tools, fixed overlays */
                    header, footer, nav,
                    [data-react-scan], [id*="react-scan"],
                    [class*="react-scan"], [class*="fps"],
                    [class*="GlobalSparkle"], [class*="sparkle"],
                    [class*="pwa"], [class*="PWA"],
                    [class*="AuthModal"], [class*="Toaster"],
                    [style*="position: fixed"], [style*="position:fixed"] {
                        display: none !important;
                    }

                    /* Invoice wrapper */
                    body { background: white !important; margin: 0; }
                    .print\\:hidden { display: none !important; }
                    .print\\:shadow-none { box-shadow: none !important; }
                    .print\\:rounded-none { border-radius: 0 !important; }

                    /* Tighten spacing so it fits on one page */
                    .max-w-3xl { max-width: 100% !important; }
                    .py-8 { padding-top: 12px !important; padding-bottom: 12px !important; }
                    .px-8 { padding-left: 24px !important; padding-right: 24px !important; }
                    .pt-8 { padding-top: 16px !important; }
                    .pb-8 { padding-bottom: 12px !important; }
                    .py-5 { padding-top: 10px !important; padding-bottom: 10px !important; }
                    .py-4 { padding-top: 8px !important; padding-bottom: 8px !important; }
                    .mb-4 { margin-bottom: 0 !important; }
                    .mt-14 { margin-top: 16px !important; }
                    .rounded-2xl { border-radius: 0 !important; }
                    .shadow-lg { box-shadow: none !important; }

                    /* Force single page */
                    html, body { height: auto !important; }
                    @page { margin: 10mm 12mm; size: A4; }
                }
            `}</style>
        </div>
    );
}
