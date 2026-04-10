import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server/auth';
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

    const isHotel = type === 'hotel';

    let booking: any = null;

    if (isHotel) {
        // Hotels: id param may be DB UUID or external booking_id
        const { data: byUuid } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();
        if (byUuid) {
            booking = byUuid;
        } else {
            const { data: byBookingId } = await supabase
                .from('bookings')
                .select('*')
                .eq('booking_id', id)
                .eq('user_id', user.id)
                .single();
            booking = byBookingId;
        }
    } else {
        const { data } = await supabase
            .from('flight_bookings')
            .select('*, flight_segments(*), passengers(*)')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();
        booking = data;
    }

    if (!booking) notFound();

    const invoiceNumber = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
    const issuedDate = new Date(booking.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
    const currency = booking.currency || 'PHP';
    const totalPrice = booking.total_price;

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
                            <p className="text-xs text-slate-500">{user.email}</p>
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
                    body { background: white; }
                    .print\\:hidden { display: none !important; }
                }
            `}</style>
        </div>
    );
}
