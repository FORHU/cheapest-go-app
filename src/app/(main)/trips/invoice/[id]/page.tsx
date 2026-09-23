import type { Metadata } from 'next';
import { createAdminClient } from '@/utils/postgres/admin';
import { notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server/auth';
import type { ReactNode } from 'react';
import { calculateNights } from '@/lib/utils';
import { PrintButton } from './PrintButton';
import { getTranslations } from 'next-intl/server';
import { canonicalBrandName } from '@/lib/brand';
import { getAirportInfo } from '@/utils/airport-info';
import { getAirlineName } from '@/utils/flight-utils';
import {
    arrivalDayOffset, countPassengers, formatAirportDay, formatAirportTime, formatDate, formatDateRange, formatMoney,
    passengerKind, receiptLegs, receiptStatus, travellerName, tripKind,
    type PassengerKind, type ReceiptLeg, type ReceiptStatus,
} from './receipt';

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
        const { data } = await db.from('flight_bookings').select('*, flight_segments(*), passengers(*)').eq('id', id).single();
        booking = data;
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
                    booking_reference: unified.booking_reference ?? null,
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
                    booking_reference: unified.booking_reference ?? null,
                    fare_policy: meta?.fare_policy ?? meta?.farePolicy ?? null,
                    provider: unified.provider,
                    trip_type: meta?.trip_type || meta?.tripType || 'one-way',
                    flight_segments: segments.map((s: any) => ({
                        airline: s.airline || s.airlineName || '',
                        flight_number: s.flight_number || s.flightNumber || '',
                        origin: s.origin || s.departure_airport || '',
                        destination: s.destination || s.arrival_airport || '',
                        departure: s.departure || s.departureTime || s.departure_time || '',
                        arrival: s.arrival || s.arrivalTime || s.arrival_time || null,
                        cabin_class: s.cabin_class || s.cabinClass || null,
                        segment_index: s.segment_index ?? s.segmentIndex ?? null,
                    })),
                    passengers: passengers.map((p: any) => ({
                        first_name: p.firstName || p.first_name || '',
                        last_name: p.lastName || p.last_name || '',
                        type: p.type || 'ADT',
                        ticket_number: p.ticketNumber || p.ticket_number || '',
                        seat_number: p.seatNumber || p.seat_number || '',
                    })),
                    _isUnified: true,
                };
            }
        }
    }

    if (!booking) notFound();


    const invoiceNumber = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
    const issuedDate = formatDate(booking.created_at, 'long');
    const currency = String(booking.payment_currency || booking.currency || 'PHP').toUpperCase();
    const totalPrice = Number(booking.charged_price ?? booking.total_price);
    const status = receiptStatus(booking.status);
    const supportEmail = process.env.NEXT_PUBLIC_BRAND_EMAIL ?? 'support@cheapestgo.com';

    // Resolve the booker's email, shown under the lead traveller.
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

    // The sale's own Booking Reference leads. The airline's PNR is what the traveller needs
    // at the airport, so it is shown beside the reference, never in its place (CONTEXT.md).
    // Bookings made before references were minted have none, and lead with the PNR, labelled
    // as what it is.
    const reference: string | null = booking.booking_reference || (isHotel ? booking.booking_id : null) || null;
    const pnr: string | null = isHotel ? null : booking.pnr || null;

    const legs = isHotel ? [] : receiptLegs(booking.flight_segments ?? []);
    const kind = tripKind(legs, booking.trip_type);
    const city = (code: string) => {
        const name = getAirportInfo(code).city;
        return name && name !== code ? `${name} (${code})` : code;
    };
    const cityName = (code: string) => getAirportInfo(code).city || code;

    const passengers: any[] = isHotel ? [] : booking.passengers ?? [];
    const paxCounts = countPassengers(passengers);
    const paxSummary = (['adult', 'child', 'infant'] as PassengerKind[])
        .filter(k => paxCounts[k] > 0)
        .map(k => t(`paxCount.${k}`, { count: paxCounts[k] }))
        .join(', ');

    const nights = isHotel && booking.check_in && booking.check_out
        ? calculateNights(new Date(booking.check_in), new Date(booking.check_out))
        : 0;
    const guestCount = Number(booking.guests_adults ?? 0) + Number(booking.guests_children ?? 0);

    let tripTitle = '';
    let tripSubtitle = '';
    if (isHotel) {
        tripTitle = booking.property_name;
        tripSubtitle = [
            formatDateRange(booking.check_in, booking.check_out),
            nights > 0 ? t('nights', { count: nights }) : '',
            guestCount > 0 ? t('guests', { count: guestCount }) : '',
        ].filter(Boolean).join(' · ');
    } else if (legs.length > 0) {
        const lastLeg = legs[legs.length - 1];
        const destination = kind === 'roundTrip' ? legs[0].last.destination : lastLeg.last.destination;
        tripTitle = `${cityName(legs[0].first.origin)} → ${cityName(destination)} · ${t(`tripKind.${kind}`)}`;
        tripSubtitle = [formatDateRange(legs[0].first.departure, lastLeg.first.departure), paxSummary]
            .filter(Boolean).join(' · ');
    }

    const legLabel = (index: number) => {
        if (kind === 'roundTrip' && legs.length === 2) return t(index === 0 ? 'leg.depart' : 'leg.return');
        if (legs.length === 1) return t('leg.depart');
        return t('leg.flight', { number: index + 1 });
    };
    const cabinLabel = (leg: ReceiptLeg) => {
        const cabin = leg.first.cabin_class;
        return cabin && ['economy', 'premium_economy', 'business', 'first'].includes(cabin) ? t(`cabin.${cabin}`) : null;
    };
    const flightNumber = (seg: { airline: string; flight_number: string }) =>
        seg.flight_number?.toUpperCase().startsWith(seg.airline?.toUpperCase() ?? '')
            ? seg.flight_number
            : `${seg.airline} ${seg.flight_number}`.trim();

    // Booking terms, each shown only when the booking actually records it.
    const bookingRows: { label: string; value: string; alert?: boolean }[] = [];
    if (isHotel) {
        if (booking.room_name) bookingRows.push({ label: t('room'), value: booking.room_name });
        const hotelPolicy: Record<string, { key: string; alert?: boolean }> = {
            non_refundable: { key: 'policy.nonRefundable', alert: true },
            partial_refund: { key: 'policy.partialRefund' },
            free_cancellation: { key: 'policy.freeCancellation' },
        };
        const policy = hotelPolicy[booking.policy_type];
        if (policy) bookingRows.push({ label: t('cancellation'), value: t(policy.key), alert: policy.alert });
    } else {
        const airlines = [...new Set(legs.flatMap(l => l.segments.map(s => getAirlineName(s.airline))).filter(Boolean))];
        if (airlines.length > 0) bookingRows.push({ label: t('airline'), value: airlines.join(', ') });
        const fp = booking.fare_policy;
        if (fp && typeof fp.isChangeable === 'boolean') {
            const fee = Number(fp.changePenaltyAmount);
            bookingRows.push({
                label: t('changes'),
                value: !fp.isChangeable
                    ? t('policy.notPermitted')
                    : fee > 0
                        ? t('policy.permittedFee', { fee: formatMoney(fee, fp.changePenaltyCurrency || currency) })
                        : t('policy.permitted'),
            });
        }
        if (fp && typeof fp.isRefundable === 'boolean') {
            const penalty = Number(fp.refundPenaltyAmount);
            bookingRows.push({
                label: t('cancellation'),
                value: !fp.isRefundable
                    ? t('policy.nonRefundable')
                    : penalty > 0
                        ? t('policy.refundablePenalty', { fee: formatMoney(penalty, fp.refundPenaltyCurrency || currency) })
                        : t('policy.refundable'),
                alert: !fp.isRefundable,
            });
        }
    }

    const refundAmount = Number(booking.refund_amount);
    const showSeat = passengers.some(p => p.seat_number);
    const showTicket = passengers.some(p => p.ticket_number);
    const paxColumns = ['minmax(0,1fr)', '80px', showTicket && '180px', showSeat && '120px'].filter(Boolean).join(' ');

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 py-10 px-4 print:bg-white print:p-0">
            {/* Print button — hidden when printing */}
            <div className="w-[816px] max-w-full mx-auto mb-4 flex justify-end print:hidden">
                <PrintButton />
            </div>

            {/* The receipt is a document, so it stays on white paper in dark mode too. */}
            <div className="w-[816px] max-w-full mx-auto bg-white text-slate-900 border border-slate-200 rounded-xl shadow-[0_20px_25px_-5px_rgba(0,0,0,0.05)] px-5 pt-8 pb-8 sm:px-16 sm:pt-14 sm:pb-10 flex flex-col gap-9 print:w-full print:border-0 print:shadow-none print:rounded-none print:px-0 print:pt-0 print:pb-0 print:gap-7">
                {/* Header. Divs, not <header>/<footer>: the print rules below hide those tags. */}
                <div className="flex flex-wrap justify-between items-start gap-6">
                    <div className="flex flex-col gap-1">
                        {/* The brand the customer actually paid, not a literal "CheapestGo". */}
                        <div className="font-display text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-blue-600">
                            {canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME)}
                        </div>
                        <div className="text-[13px] text-slate-600">{t('yourTravelPartner')}</div>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-2">
                        <div className="flex items-center gap-2.5">
                            {status && <StatusBadge status={status} label={t(`status.${status}`)} />}
                            <span className="font-display text-[22px] leading-tight font-extrabold tracking-[-0.01em]">{t('eReceipt')}</span>
                        </div>
                        <div className="text-[13px] text-slate-600 sm:text-right leading-[1.6]">
                            {t('invoiceNumber', { number: invoiceNumber })}<br />
                            {t('issuedOn', { date: issuedDate })}
                        </div>
                    </div>
                </div>

                {/* Summary band */}
                <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-5 sm:gap-8 items-center bg-blue-50 rounded-xl px-6 py-5 print:[print-color-adjust:exact]">
                    <div className="flex flex-col gap-1">
                        <BandLabel>{reference ? t('bookingReference') : t('airlinePnr')}</BandLabel>
                        <div className="font-mono text-[28px] leading-tight font-bold tracking-[0.08em] break-all">{reference ?? pnr ?? '—'}</div>
                        {reference && pnr && (
                            <div className="text-[12px] text-slate-600">
                                {t('airlinePnr')} <span className="font-mono font-semibold text-slate-900 tracking-[0.08em]">{pnr}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 sm:border-l sm:border-slate-300 sm:pl-8 min-w-0">
                        <BandLabel>{t('trip')}</BandLabel>
                        <div className="text-[16px] font-semibold">{tripTitle}</div>
                        {tripSubtitle && <div className="text-[13px] text-slate-600">{tripSubtitle}</div>}
                    </div>
                    <div className="flex flex-col gap-1 sm:items-end">
                        <BandLabel>{t('totalPaid')}</BandLabel>
                        <div className="font-display text-[28px] leading-tight font-extrabold">{formatMoney(totalPrice, currency)}</div>
                    </div>
                </div>

                {/* Itinerary */}
                {(isHotel || legs.length > 0) && (
                    <div className="flex flex-col gap-3.5 print:break-inside-avoid">
                        <SectionLabel>{t('itinerary')}</SectionLabel>
                        <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
                            {isHotel ? (
                                <ItineraryRow
                                    label={t('stay')}
                                    title={nights > 0 ? t('nights', { count: nights }) : ''}
                                    detail={guestCount > 0 ? t('guests', { count: guestCount }) : null}
                                    from={{ time: formatAirportDay(booking.check_in), place: t('checkIn'), day: '' }}
                                    to={{ time: formatAirportDay(booking.check_out), place: t('checkOut'), day: '' }}
                                />
                            ) : legs.map((leg, i) => (
                                <ItineraryRow
                                    key={i}
                                    label={legLabel(i)}
                                    title={leg.segments.map(flightNumber)}
                                    detail={cabinLabel(leg)}
                                    from={{ time: formatAirportTime(leg.first.departure), place: city(leg.first.origin), day: formatAirportDay(leg.first.departure) }}
                                    middleTop={t('stops', { count: leg.stops })}
                                    middleBottom={leg.stops > 0 ? leg.segments.slice(0, -1).map(s => s.destination).join(' · ') : null}
                                    to={{
                                        time: leg.last.arrival ? formatAirportTime(leg.last.arrival) : '',
                                        place: city(leg.last.destination),
                                        day: leg.last.arrival ? formatAirportDay(leg.last.arrival) : '',
                                        dayOffset: leg.last.arrival ? arrivalDayOffset(leg.first.departure, leg.last.arrival) : 0,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Travellers */}
                <div className="flex flex-col gap-3.5 print:break-inside-avoid">
                    <SectionLabel>{isHotel ? t('guest') : t('passengers')}</SectionLabel>
                    {isHotel ? (
                        <div className="flex flex-col gap-0.5 text-[14px]">
                            <span className="font-semibold uppercase">{travellerName(booking.holder_last_name, booking.holder_first_name)}</span>
                            <span className="text-[12px] text-slate-600">{t('leadGuest')}{booking.holder_email ? ` · ${booking.holder_email}` : ''}</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3" style={{ ['--pax-cols' as string]: paxColumns }}>
                            <div className="hidden sm:grid [grid-template-columns:var(--pax-cols)] gap-4 text-[12px] text-slate-600 pb-2 border-b border-slate-200">
                                <span>{t('colName')}</span>
                                <span>{t('colType')}</span>
                                {showTicket && <span>{t('colTicket')}</span>}
                                {showSeat && <span>{t('colSeat')}</span>}
                            </div>
                            {passengers.map((p, i) => (
                                <div key={i} className="grid grid-cols-1 sm:[grid-template-columns:var(--pax-cols)] gap-1 sm:gap-4 text-[14px] sm:items-center">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-semibold uppercase">{travellerName(p.last_name, p.first_name)}</span>
                                        {i === 0 && customerEmail && <span className="text-[12px] text-slate-600">{customerEmail}</span>}
                                    </div>
                                    <span><MobileLabel>{t('colType')}</MobileLabel>{t(`paxType.${passengerKind(p.type)}`)}</span>
                                    {showTicket && (
                                        <span className="font-mono text-[13px]"><MobileLabel>{t('colTicket')}</MobileLabel>{p.ticket_number || '—'}</span>
                                    )}
                                    {showSeat && (
                                        <span className="font-mono text-[13px]"><MobileLabel>{t('colSeat')}</MobileLabel>{p.seat_number || '—'}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Booking terms and payment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-9 sm:gap-12 print:break-inside-avoid">
                    {bookingRows.length > 0 && (
                        <div className="flex flex-col gap-3.5">
                            <SectionLabel>{t('booking')}</SectionLabel>
                            <div className="flex flex-col gap-2.5 text-[14px]">
                                {bookingRows.map(row => (
                                    <KeyValue key={row.label} label={row.label}>
                                        <span className={row.alert ? 'text-rose-600 font-semibold' : undefined}>{row.value}</span>
                                    </KeyValue>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-3.5">
                        <SectionLabel>{t('payment')}</SectionLabel>
                        <div className="flex flex-col gap-2.5 text-[14px]">
                            <div className="flex justify-between items-baseline gap-4">
                                <span className="font-bold">{t('totalWithCurrency', { currency })}</span>
                                <span className="text-[18px] font-extrabold">{formatMoney(totalPrice, currency)}</span>
                            </div>
                            <KeyValue label={t('paidWith')} className="text-[13px]">
                                {t('paidWithCard', { date: formatDate(booking.created_at) })}
                            </KeyValue>
                            {refundAmount > 0 && (
                                <KeyValue label={t('status.refunded')} className="text-[13px]">
                                    {formatMoney(refundAmount, String(booking.refund_currency || currency).toUpperCase())}
                                </KeyValue>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex flex-col gap-2.5 border-t border-slate-200 pt-6 text-[13px] leading-[1.6] text-slate-900">
                    <p>
                        {t.rich('thankYou', {
                            email: () => (
                                <a href={`mailto:${supportEmail}`} className="text-blue-600 font-semibold no-underline">{supportEmail}</a>
                            ),
                        })}
                    </p>
                </div>
            </div>

            <style>{`
                @media print {
                    /* Hide everything on the page by default */
                    body > * { display: none !important; }

                    /* Show only the root wrapper that contains the receipt */
                    body > div { display: block !important; }

                    /* Hide the site header, footer, nav, dev tools and fixed overlays */
                    header, footer, nav,
                    [data-react-scan], [id*="react-scan"],
                    [class*="react-scan"], [class*="fps"],
                    [class*="GlobalSparkle"], [class*="sparkle"],
                    [class*="pwa"], [class*="PWA"],
                    [class*="AuthModal"], [class*="Toaster"],
                    [style*="position: fixed"], [style*="position:fixed"] {
                        display: none !important;
                    }

                    body { background: white !important; margin: 0; }
                    html, body { height: auto !important; }
                    @page { margin: 12mm 14mm; size: A4; }
                }
            `}</style>
        </div>
    );
}

function SectionLabel({ children }: { children: ReactNode }) {
    return <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-slate-600">{children}</div>;
}

function BandLabel({ children }: { children: ReactNode }) {
    return <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-blue-700">{children}</div>;
}

/** The column heading, repeated beside each value once the passenger table stacks on a phone. */
function MobileLabel({ children }: { children: ReactNode }) {
    return <span className="sm:hidden text-[12px] text-slate-600 font-sans">{children}: </span>;
}

function KeyValue({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={`flex justify-between gap-4 ${className}`}>
            <span className="text-slate-600">{label}</span>
            <span className="text-right">{children}</span>
        </div>
    );
}

const STATUS_STYLES: Record<Exclude<ReceiptStatus, null>, string> = {
    paid: 'text-green-600 bg-green-600/10',
    refundPending: 'text-amber-600 bg-amber-600/10',
    refunded: 'text-rose-600 bg-rose-600/10',
    cancelled: 'text-rose-600 bg-rose-600/10',
};

function StatusBadge({ status, label }: { status: Exclude<ReceiptStatus, null>; label: string }) {
    return (
        <span className={`text-[11px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-full print:[print-color-adjust:exact] ${STATUS_STYLES[status]}`}>
            {label}
        </span>
    );
}

interface Endpoint {
    time: string;
    place: string;
    day: string;
    dayOffset?: number;
}

/** One leg of a flight, or a hotel stay: what, from, how, to. */
function ItineraryRow({ label, title, detail, from, to, middleTop, middleBottom }: {
    label: string;
    title: string | string[];
    detail?: string | null;
    from: Endpoint;
    to: Endpoint;
    middleTop?: string | null;
    middleBottom?: string | null;
}) {
    const titles = Array.isArray(title) ? title : [title];
    return (
        <div className="grid grid-cols-2 sm:grid-cols-[110px_minmax(0,1fr)_90px_minmax(0,1fr)] gap-4 items-center px-5 py-[18px]">
            <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
                <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-blue-600">{label}</span>
                {titles.filter(Boolean).map(t => <span key={t} className="text-[14px] font-bold">{t}</span>)}
                {detail && <span className="text-[12px] text-slate-600">{detail}</span>}
            </div>
            <div className="flex flex-col gap-0.5">
                {from.time && <span className="text-[20px] font-bold">{from.time}</span>}
                <span className="text-[13px] font-semibold">{from.place}</span>
                {from.day && <span className="text-[12px] text-slate-600">{from.day}</span>}
            </div>
            <div className="hidden sm:flex flex-col items-center gap-1 text-center">
                <span className="text-[12px] text-slate-600 min-h-[1lh]">{middleTop}</span>
                <div className="w-full h-px bg-slate-300" />
                <span className="text-[12px] text-slate-600 min-h-[1lh]">{middleBottom}</span>
            </div>
            <div className="flex flex-col gap-0.5 items-end text-right">
                {to.time && (
                    <span className="text-[20px] font-bold">
                        {to.time}
                        {!!to.dayOffset && <sup className="text-[11px] text-rose-600 font-bold ml-1">+{to.dayOffset}</sup>}
                    </span>
                )}
                <span className="text-[13px] font-semibold">{to.place}</span>
                {to.day && <span className="text-[12px] text-slate-600">{to.day}</span>}
            </div>
        </div>
    );
}
