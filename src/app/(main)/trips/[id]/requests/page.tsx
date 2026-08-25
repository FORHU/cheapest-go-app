import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createAdminClient } from '@/utils/postgres/admin';
import SpecialRequestsForm from '@/components/trips/SpecialRequestsForm';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Special Requests',
    robots: { index: false, follow: false },
};

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function SpecialRequestsPage({ params }: PageProps) {
    const { id } = await params;
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) redirect(`/login?next=/trips/${id}/requests`);

    const db = createAdminClient();
    const { data: booking } = await db
        .from('bookings')
        .select('booking_id, property_name, holder_first_name, holder_last_name, holder_email, special_requests, status')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (!booking) notFound();

    return (
        <main className="min-h-screen pt-4 pb-20 px-3 sm:pt-6 sm:px-4 md:px-6">
            <div className="max-w-lg mx-auto">
                <Link href={`/trips/${id}`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors mb-5">
                    <ArrowLeft size={15} />
                    Back to booking
                </Link>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">Special requests</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {booking.property_name} · Ref: <span className="font-mono">{booking.booking_id}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-3">
                        Requests are passed to the property but aren't guaranteed — availability depends on the hotel.
                    </p>

                    {booking.status?.startsWith('cancelled') ? (
                        <p className="mt-6 text-sm text-slate-500">This booking is cancelled, so special requests can no longer be updated.</p>
                    ) : (
                        <SpecialRequestsForm
                            bookingId={booking.booking_id}
                            dbId={id}
                            firstName={booking.holder_first_name || ''}
                            lastName={booking.holder_last_name || ''}
                            email={booking.holder_email || ''}
                            initialRemarks={booking.special_requests || ''}
                        />
                    )}
                </div>
            </div>
        </main>
    );
}
