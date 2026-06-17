import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { formatCurrency, calculateNights } from '@/lib/utils';
import {
    ArrowLeft, Calendar, Users, MapPin, Plane, FileText,
    CheckCircle, XCircle, Clock, AlertTriangle, RotateCcw,
    ChevronRight, Luggage, CreditCard, Shield,
} from 'lucide-react';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Booking Details | CheapestGo',
    robots: { index: false, follow: false },
};

// ── Status display helpers ────────────────────────────────────────────────────

const HOTEL_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending:                   { label: 'Pending',           color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',   icon: <Clock size={13} /> },
    confirmed:                 { label: 'Confirmed',         color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: <CheckCircle size={13} /> },
    completed:                 { label: 'Completed',         color: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400',       icon: <CheckCircle size={13} /> },
    cancelled:                 { label: 'Cancelled',         color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',           icon: <XCircle size={13} /> },
    cancelled_refunded:        { label: 'Refunded',          color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',       icon: <RotateCcw size={13} /> },
    cancelled_refund_failed:   { label: 'Refund Failed',     color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',           icon: <AlertTriangle size={13} /> },
};

const FLIGHT_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    booked:            { label: 'Processing',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         icon: <Clock size={13} /> },
    pnr_created:       { label: 'Booked',            color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         icon: <CheckCircle size={13} /> },
    awaiting_ticket:   { label: 'Ticketing',         color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',     icon: <Clock size={13} /> },
    ticketed:          { label: 'Confirmed',         color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: <CheckCircle size={13} /> },
    failed:            { label: 'Failed',            color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             icon: <XCircle size={13} /> },
    cancel_requested:  { label: 'Cancellation Pending', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: <Clock size={13} /> },
    cancel_failed:     { label: 'Cancel Failed',     color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             icon: <AlertTriangle size={13} /> },
    cancelled:         { label: 'Cancelled',         color: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400',         icon: <XCircle size={13} /> },
    refund_pending:    { label: 'Refund Pending',    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: <Clock size={13} /> },
    refund_failed:     { label: 'Refund Failed',     color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             icon: <AlertTriangle size={13} /> },
    refunded:          { label: 'Refunded',          color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',         icon: <RotateCcw size={13} /> },
    cancelled_provider_missing: { label: 'Cancelled', color: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400',        icon: <XCircle size={13} /> },
};

function StatusBadge({ status, map }: { status: string; map: typeof HOTEL_STATUS }) {
    const cfg = map[status] ?? { label: status, color: 'bg-slate-100 text-slate-600', icon: null };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
            {cfg.icon}{cfg.label}
        </span>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string, opts?: Intl.DateTimeFormatOptions) {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...opts });
}

function fmtTime(s: string) {
    return new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white text-right">{value}</span>
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">{icon}</span>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
            </div>
            <div className="px-5 py-1">{children}</div>
        </div>
    );
}

// ── Hotel detail view ─────────────────────────────────────────────────────────

function HotelDetail({ booking }: { booking: any }) {
    const nights = calculateNights(new Date(booking.check_in), new Date(booking.check_out));
    const policy = booking.cancellation_policy as any;
    const refundable = policy?.refundableTag === 'RFN';
    const freeCancelDeadline = policy?.cancelPolicyInfos?.[0]?.cancelTime;

    return (
        <div className="space-y-4">
            {/* Hero */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                {booking.property_image && (
                    <div className="relative h-48 w-full overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={booking.property_image} alt={booking.property_name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-4 left-5">
                            <h1 className="text-xl font-bold text-white">{booking.property_name}</h1>
                            <p className="text-sm text-white/80">{booking.room_name}</p>
                        </div>
                    </div>
                )}
                <div className={`px-5 py-4 flex items-start justify-between gap-4 ${!booking.property_image ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}>
                    {!booking.property_image && (
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{booking.property_name}</h1>
                            <p className="text-sm text-slate-500">{booking.room_name}</p>
                        </div>
                    )}
                    <div className={!booking.property_image ? 'shrink-0' : 'w-full flex justify-between items-center'}>
                        <StatusBadge status={booking.status} map={HOTEL_STATUS} />
                        <p className="text-xs text-slate-400 mt-1">Ref: <span className="font-mono">{booking.booking_id}</span></p>
                    </div>
                </div>
            </div>

            {/* Stay details */}
            <Section title="Stay Details" icon={<Calendar size={15} />}>
                <InfoRow label="Check-in" value={fmtDate(booking.check_in)} />
                <InfoRow label="Check-out" value={fmtDate(booking.check_out)} />
                <InfoRow label="Duration" value={`${nights} night${nights !== 1 ? 's' : ''}`} />
                <InfoRow label="Room" value={booking.room_name} />
                <InfoRow
                    label="Guests"
                    value={`${booking.guests_adults} adult${booking.guests_adults !== 1 ? 's' : ''}${booking.guests_children > 0 ? `, ${booking.guests_children} child${booking.guests_children !== 1 ? 'ren' : ''}` : ''}`}
                />
                {booking.special_requests && (
                    <InfoRow label="Special Requests" value={booking.special_requests} />
                )}
            </Section>

            {/* Guest info */}
            <Section title="Guest Information" icon={<Users size={15} />}>
                <InfoRow label="Name" value={`${booking.holder_first_name} ${booking.holder_last_name}`} />
                <InfoRow label="Email" value={booking.holder_email} />
            </Section>

            {/* Cancellation policy */}
            <Section title="Cancellation Policy" icon={<Shield size={15} />}>
                <div className="py-3">
                    <div className={`flex items-center gap-2 mb-3 p-3 rounded-xl ${refundable ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                        {refundable
                            ? <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                            : <XCircle size={16} className="text-red-500 shrink-0" />}
                        <span className={`text-sm font-semibold ${refundable ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {refundable ? 'Free cancellation available' : 'Non-refundable'}
                        </span>
                    </div>
                    {freeCancelDeadline && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Free cancellation until{' '}
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {fmtDate(freeCancelDeadline, { month: 'long', day: 'numeric', year: 'numeric' })}
                            </span>
                        </p>
                    )}
                    {policy?.cancelPolicyInfos?.map((p: any, i: number) => (
                        <div key={i} className="mt-2 text-xs text-slate-500">
                            After {fmtDate(p.cancelTime)}: penalty of {formatCurrency(p.amount, p.currency || booking.currency)}
                        </div>
                    ))}
                    {policy?.hotelRemarks?.map((r: string, i: number) => (
                        <p key={i} className="mt-1.5 text-xs text-slate-400 italic">{r}</p>
                    ))}
                    {!policy && (
                        <p className="text-xs text-slate-400">Cancellation policy details not available.</p>
                    )}
                </div>
            </Section>

            {/* Payment */}
            <Section title="Payment" icon={<CreditCard size={15} />}>
                <InfoRow label="Total Paid" value={<span className="text-base font-bold">{formatCurrency(booking.total_price, booking.currency || 'USD')}</span>} />
                <InfoRow label="Payment Method" value="Card (Stripe)" />
                <InfoRow label="Booked On" value={fmtDate(booking.created_at)} />
            </Section>
        </div>
    );
}

// ── Flight detail view ────────────────────────────────────────────────────────

function FlightDetail({ booking }: { booking: any }) {
    const segments: any[] = booking.flight_segments ?? [];
    const passengers: any[] = booking.passengers ?? [];

    const origin = segments[0]?.origin ?? '—';
    const destination = segments[segments.length - 1]?.destination ?? '—';
    const departDate = segments[0]?.departure ? fmtDate(segments[0].departure) : '—';

    return (
        <div className="space-y-4">
            {/* Hero */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                    <Plane size={18} className="text-blue-500" />
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                        {origin} → {destination}
                    </h1>
                </div>
                <p className="text-sm text-slate-500 mb-3">{departDate} · {booking.trip_type ?? 'one-way'}</p>
                <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={booking.status} map={FLIGHT_STATUS} />
                    {booking.pnr && (
                        <span className="text-xs text-slate-500">
                            PNR: <span className="font-mono font-semibold text-slate-800 dark:text-white tracking-wider">{booking.pnr}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Itinerary */}
            <Section title="Itinerary" icon={<Plane size={15} />}>
                <div className="py-2 space-y-0">
                    {segments.map((seg: any, i: number) => (
                        <div key={i} className="flex gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <div className="flex flex-col items-center pt-1">
                                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                {i < segments.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 my-1" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                        {seg.origin} → {seg.destination}
                                    </span>
                                    <span className="text-xs font-mono text-slate-500 shrink-0">
                                        {seg.airline} {seg.flight_number}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    {seg.departure && <span>{fmtDate(seg.departure)} · {fmtTime(seg.departure)}</span>}
                                    {seg.arrival && <><span>→</span><span>{fmtTime(seg.arrival)}</span></>}
                                </div>
                            </div>
                        </div>
                    ))}
                    {segments.length === 0 && (
                        <p className="text-sm text-slate-400 py-3">No segment details available.</p>
                    )}
                </div>
            </Section>

            {/* Passengers */}
            {passengers.length > 0 && (
                <Section title="Passengers" icon={<Users size={15} />}>
                    {passengers.map((p: any, i: number) => (
                        <div key={i} className="py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                                        {p.first_name} {p.last_name}
                                        <span className="ml-2 text-xs font-normal text-slate-400">({p.type})</span>
                                    </p>
                                    {p.ticket_number && (
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                                            E-Ticket: {p.ticket_number}
                                        </p>
                                    )}
                                    {p.seat_number && (
                                        <p className="text-xs text-slate-400 mt-0.5">Seat {p.seat_number}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </Section>
            )}

            {/* Payment */}
            <Section title="Payment" icon={<CreditCard size={15} />}>
                <InfoRow label="Total Paid" value={<span className="text-base font-bold">{formatCurrency(booking.total_price, booking.currency || 'USD')}</span>} />
                <InfoRow label="Provider" value={<span className="capitalize">{booking.provider}</span>} />
                <InfoRow label="Booked On" value={fmtDate(booking.created_at)} />
            </Section>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function TripDetailPage({ params }: PageProps) {
    const { id } = await params;
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) redirect(`/login?next=/trips/${id}`);

    const db = createAdminClient();
    const sql = getSqlAdmin();

    // Try hotel booking first
    const { data: hotelBooking } = await db
        .from('bookings')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (hotelBooking) {
        const invoiceUrl = `/trips/invoice/${hotelBooking.id}?type=hotel`;
        return (
            <main className="min-h-screen pt-4 pb-20 px-3 sm:pt-6 sm:px-4 md:px-6">
                <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-5">
                        <Link href="/trips" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                            <ArrowLeft size={15} />
                            My Trips
                        </Link>
                        <Link
                            href={invoiceUrl}
                            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            <FileText size={13} />
                            View Receipt
                        </Link>
                    </div>
                    <HotelDetail booking={hotelBooking} />
                </div>
            </main>
        );
    }

    // Try flight booking
    const [flightRows] = await Promise.all([
        sql`
            SELECT fb.*,
                   json_agg(DISTINCT fs.*) FILTER (WHERE fs.id IS NOT NULL) AS flight_segments,
                   json_agg(DISTINCT p.*)  FILTER (WHERE p.id IS NOT NULL)  AS passengers
            FROM flight_bookings fb
            LEFT JOIN flight_segments fs ON fs.booking_id = fb.id
            LEFT JOIN passengers p ON p.booking_id = fb.id
            WHERE fb.id = ${id} AND fb.user_id = ${user.id}
            GROUP BY fb.id
            LIMIT 1
        `,
    ]);

    const flightBooking = flightRows[0] ?? null;

    if (flightBooking) {
        // Sort segments by departure time
        if (Array.isArray(flightBooking.flight_segments)) {
            flightBooking.flight_segments.sort(
                (a: any, b: any) => new Date(a.departure).getTime() - new Date(b.departure).getTime()
            );
        }
        const invoiceUrl = `/trips/invoice/${flightBooking.id}?type=flight`;
        return (
            <main className="min-h-screen pt-4 pb-20 px-3 sm:pt-6 sm:px-4 md:px-6">
                <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-5">
                        <Link href="/trips" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                            <ArrowLeft size={15} />
                            My Trips
                        </Link>
                        <Link
                            href={invoiceUrl}
                            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            <FileText size={13} />
                            View Receipt
                        </Link>
                    </div>
                    <FlightDetail booking={flightBooking} />
                </div>
            </main>
        );
    }

    notFound();
}
