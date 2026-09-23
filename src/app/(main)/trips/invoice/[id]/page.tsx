import type { Metadata } from 'next';
import { createAdminClient } from '@/utils/postgres/admin';
import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { formatCurrency, calculateNights } from '@/lib/utils';
import { PrintButton } from './PrintButton';
import { getTranslations } from 'next-intl/server';
import { canonicalBrandName } from '@/lib/brand';
import { receiptCancellation, receiptDiscount, fareBreakdown } from '@/lib/invoice/receipt-details';
import { loadFlightBookingRelations, loadFlightFareBase } from '@/lib/invoice/flight-booking-relations';

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ type?: string }>;
}

export default async function InvoicePage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { type } = await searchParams;

    // Receipt pages are a Capability Link: the UUID in the URL is the credential (122 bits
    // of entropy, shared only via the confirmation email), so no login is required and the
    // link keeps working when a guest forwards it to a travel companion or an expense desk.
    // See ADR-0027 for the rules a capability link must satisfy. We still read the session
    // to expose admin controls when present.
    const { user } = await getAuthenticatedUser().catch(() => ({ user: null, error: null }));
    const t = await getTranslations('invoice');

    const db = createAdminClient();

    const isHotel = type === 'hotel';

    let booking: any = null;

    if (isHotel) {
        // UUID only. This used to fall back to `booking_id`, the *supplier's* reference —
        // a value we do not control the entropy of, which appears in supplier payloads,
        // admin screens and support threads. A route with a strong credential and a weak
        // alternate lookup has the strength of the weak one, and every link we generate
        // uses the UUID, so the fallback bought nothing. See ADR-0027.
        const { data: byUuid } = await db.from('bookings').select('*').eq('id', id).single();
        booking = byUuid;
    } else {
        // The relations are loaded separately: this codebase's query builder silently
        // drops Supabase embed selectors, so `flight_segments(*), passengers(*)` came
        // back undefined and the receipt rendered an empty itinerary. See
        // loadFlightBookingRelations.
        const { data } = await db.from('flight_bookings').select('*').eq('id', id).single();
        if (data) {
            const relations = await loadFlightBookingRelations((data as any).id);
            booking = { ...data, flight_segments: relations.segments, passengers: relations.passengers };
        } else {
            booking = data;
        }
    }

    // Fallback: check unified_bookings (newer bookings live here)
    if (!booking) {
        const { data: unified } = await db.from('unified_bookings').select('*').eq('id', id).single();

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
    const currency = booking.payment_currency || booking.currency || 'PHP';
    const totalPrice = booking.charged_price ?? booking.total_price;

    // What the traveller can be told beyond the total. Derived in one place shared with
    // the PDF renderer, which used to drift from this page — see ADR-0042.
    const cancellation = receiptCancellation(booking, isHotel);
    const discount = receiptDiscount(booking);

    const cancellationLabel = (() => {
        if (!cancellation) return null;
        switch (cancellation.kind) {
            case 'free':
                return cancellation.until
                    ? t('freeCancellationUntil', {
                        date: new Date(cancellation.until).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                        }),
                    })
                    : t('freeCancellation');
            case 'non_refundable': return t('nonRefundable');
            case 'partial': return t('partialRefund');
            case 'tiered': return t('tieredPolicy');
            case 'refundable': return t('refundable');
        }
    })();

    // The one traveller the document is addressed to. A hotel booking names its holder;
    // a flight names the lead passenger, who is who the ticket belongs to.
    const leadName = isHotel
        ? `${booking.holder_first_name ?? ''} ${booking.holder_last_name ?? ''}`.trim()
        : `${booking.passengers?.[0]?.first_name ?? ''} ${booking.passengers?.[0]?.last_name ?? ''}`.trim();

    // Stored on `passengers`, so this is a real value rather than the placeholder the
    // design carries. Absent until the airline issues the ticket, and then the row goes.
    const leadTicketNumber: string | null = booking.passengers?.[0]?.ticket_number || null;

    // The airline that issued the ticket, taken from the first segment's marketing
    // carrier. The design's own example named an airport here.
    const issuingAirline: string | null = isHotel
        ? (booking.property_name || null)
        : (booking.flight_segments?.[0]?.airline || null);

    const bookingReference: string = (isHotel ? booking.booking_id : booking.pnr) || '';

    // The Figma's Fare and Taxes rows. They render only for a booking whose offer
    // recorded a fare before tax — Duffel sends one on every offer, but nothing parsed
    // it until recently, so older bookings have none and the rows stay hidden (ADR-0042).
    const fareBase = isHotel ? null : await loadFlightFareBase(booking.session_id);
    const breakdown = fareBreakdown(totalPrice, fareBase?.base, fareBase?.currency, currency);

    // Resolve customer email for the "Billed to" section.
    // Always look up the booking owner's profile; fall back to the viewer's session email.
    let customerEmail: string | null = user?.email ?? null;
    if (!isHotel && booking.user_id) {
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
                        {/* The brand the customer actually paid. This was the literal "CheapestGo" on every
                            receipt, including those issued by the Korean storefront. */}
                        <h1 className="text-2xl font-extrabold text-indigo-600 tracking-tight">{canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME)}</h1>
                        <p className="text-xs text-slate-400 mt-0.5">{t('yourTravelCompanion')}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-bold text-slate-800 dark:text-white">{t('receipt')}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{invoiceNumber}</p>
                        <p className="text-xs text-slate-400">{t('issued', { date: issuedDate })}</p>
                    </div>
                </div>

                {/* Who the document is for, called out above the detail blocks.
                    No contact number: the page's credential is a forwardable UUID, and a
                    phone beside a name, reference and ticket number is what an airline
                    asks for to verify a caller. See ADR-0027. */}
                <div className="px-8 pt-5 pb-4 space-y-1.5">
                    <div className="flex items-baseline gap-2 text-sm">
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wide text-xs">
                            {isHotel ? t('guestLabel') : t('passengerLabel')}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="text-slate-800 dark:text-white uppercase">{leadName}</span>
                    </div>
                    {leadTicketNumber && (
                        <div className="flex items-baseline gap-2 text-sm">
                            <span className="text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wide text-xs">
                                {t('ticketNumberLabel')}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">|</span>
                            <span className="font-mono text-slate-800 dark:text-white">{leadTicketNumber}</span>
                        </div>
                    )}
                </div>

                {/* Your details */}
                <div className="px-8 pb-5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{t('yourDetails')}</p>
                    <dl className="space-y-1.5 text-sm">
                        <div className="flex items-baseline justify-between gap-6">
                            <dt className="text-slate-500 dark:text-slate-400">{isHotel ? t('guestName') : t('passengerName')}</dt>
                            <dd className="text-slate-800 dark:text-white text-right">{leadName}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-6">
                            <dt className="text-slate-500 dark:text-slate-400">{t('emailAddress')}</dt>
                            <dd className="text-slate-800 dark:text-white text-right break-all">
                                {isHotel ? booking.holder_email : customerEmail}
                            </dd>
                        </div>
                    </dl>
                </div>

                {/* Itinerary */}
                <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{isHotel ? t('stay') : t('itinerary')}</p>

                    {isHotel ? (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                                    <th className="text-left pb-2 font-medium">{t('description')}</th>
                                    <th className="text-right pb-2 font-medium">{t('amount')}</th>
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
                                    <th className="text-left pb-2 font-medium">{t('flight')}</th>
                                    <th className="text-left pb-2 font-medium">{t('route')}</th>
                                    <th className="text-left pb-2 font-medium">{t('date')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {(booking.flight_segments ?? []).map((seg: any, i: number) => (
                                    <tr key={i}>
                                        <td className="py-2.5 text-xs text-slate-600 dark:text-slate-300 font-medium align-top">
                                            {seg.airline} {seg.flight_number}
                                        </td>
                                        <td className="py-2.5 text-xs text-slate-600 dark:text-slate-300 align-top">
                                            {seg.origin} → {seg.destination}
                                        </td>
                                        <td className="py-2.5 text-xs text-slate-500 align-top">
                                            {new Date(seg.departure).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {/* Times are rendered in the reader's own timezone, not the
                                                airport's — the stored values are instants and nothing here
                                                carries an IANA zone per airport to convert them back with. */}
                                            {seg.arrival && (
                                                <span className="block text-slate-400">
                                                    {new Date(seg.departure).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                    {' – '}
                                                    {new Date(seg.arrival).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Passengers for flights */}
                    {!isHotel && booking.passengers?.length > 0 && (
                        <div className="mt-4">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t('passengers')}</p>
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

                {/* Flight / stay details.
                    The design also draws Fare, Taxes, Restriction Endorsements and Fare
                    Calculation. None of them is rendered: no tax figure is recorded
                    anywhere (ADR-0042), and the last two come from a Mystifly ticket-display
                    call that cannot run while Duffel is the only live provider. The rows
                    return when there is something true to put in them — a blank label or a
                    zero would read as a fact. */}
                <div className="px-8 py-5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                        {isHotel ? t('stayDetails') : t('flightDetails')}
                    </p>
                    <dl className="space-y-1.5 text-sm">
                        <div className="flex items-baseline justify-between gap-6">
                            <dt className="text-slate-500 dark:text-slate-400">{isHotel ? t('bookingRef') : t('pnr')}</dt>
                            <dd className="font-mono text-slate-800 dark:text-white text-right">{bookingReference}</dd>
                        </div>

                        {leadTicketNumber && (
                            <div className="flex items-baseline justify-between gap-6">
                                <dt className="text-slate-500 dark:text-slate-400">{t('ticketNumber')}</dt>
                                <dd className="font-mono text-slate-800 dark:text-white text-right">{leadTicketNumber}</dd>
                            </div>
                        )}

                        <div className="flex items-baseline justify-between gap-6">
                            <dt className="text-slate-500 dark:text-slate-400">{t('formOfPayment')}</dt>
                            <dd className="text-slate-800 dark:text-white text-right">{t('paymentMethod')}</dd>
                        </div>

                        {/* Fare and the rest. Derived so the two rows always account for the
                            whole charge; the second is never called "Tax" alone, because it
                            carries any platform fee as well (ADR-0042). */}
                        {breakdown && (
                            <>
                                <div className="flex items-baseline justify-between gap-6">
                                    <dt className="text-slate-500 dark:text-slate-400">{t('fare')}</dt>
                                    <dd className="text-slate-800 dark:text-white text-right">
                                        {formatCurrency(breakdown.fare, currency)}
                                    </dd>
                                </div>
                                <div className="flex items-baseline justify-between gap-6">
                                    <dt className="text-slate-500 dark:text-slate-400">{t('taxesAndFees')}</dt>
                                    <dd className="text-slate-800 dark:text-white text-right">
                                        {formatCurrency(breakdown.taxesAndFees, currency)}
                                    </dd>
                                </div>
                            </>
                        )}

                        {/* A voucher the traveller used is theirs to see, and it sits where
                            a reader expects a deduction: immediately above the total. */}
                        {discount && (
                            <div className="flex items-baseline justify-between gap-6">
                                <dt className="text-slate-500 dark:text-slate-400">
                                    {discount.code ? t('voucherApplied', { code: discount.code }) : t('discount')}
                                </dt>
                                <dd className="font-semibold text-emerald-600 dark:text-emerald-400 text-right">
                                    −{formatCurrency(discount.amount, currency)}
                                </dd>
                            </div>
                        )}

                        <div className="flex items-baseline justify-between gap-6">
                            <dt className="text-slate-500 dark:text-slate-400">
                                {t('totalAmount')}
                                {/* Only worth saying when the parts are not shown above. */}
                                {!breakdown && <span className="block text-[11px] text-slate-400">{t('includesTaxes')}</span>}
                            </dt>
                            <dd className="font-bold text-slate-900 dark:text-white text-right">
                                {formatCurrency(totalPrice, currency)}
                            </dd>
                        </div>

                        {issuingAirline && (
                            <div className="flex items-baseline justify-between gap-6">
                                <dt className="text-slate-500 dark:text-slate-400">{isHotel ? t('property') : t('issuingAirline')}</dt>
                                <dd className="text-slate-800 dark:text-white text-right">{issuingAirline}</dd>
                            </div>
                        )}

                        {/* Absent terms say nothing at all. A booking that never recorded its
                            rules must not read as non-refundable on the document proving what
                            the traveller paid. */}
                        {cancellationLabel && (
                            <div className="flex items-baseline justify-between gap-6">
                                <dt className="text-slate-500 dark:text-slate-400">{t('cancellation')}</dt>
                                <dd className="text-slate-800 dark:text-white text-right">{cancellationLabel}</dd>
                            </div>
                        )}
                    </dl>
                </div>

                {/* Footer */}
                <div className="px-8 pb-8">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-5 py-4 text-xs text-slate-400 text-center">
                        {t('thankYou')}{' '}
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
