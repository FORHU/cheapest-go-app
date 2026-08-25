import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createAdminClient } from '@/utils/postgres/admin';
import ShareBookingForm from '@/components/trips/ShareBookingForm';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Share Booking Confirmation',
    robots: { index: false, follow: false },
};

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ShareBookingPage({ params }: PageProps) {
    const { id } = await params;
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) redirect(`/login?next=/trips/${id}/share`);

    const db = createAdminClient();
    const { data: booking } = await db
        .from('bookings')
        .select('booking_id, property_name')
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
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">Share booking confirmation</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {booking.property_name} · Ref: <span className="font-mono">{booking.booking_id}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-3">
                        Resend the confirmation email to yourself or anyone else — useful for a travel companion or your own records.
                    </p>

                    <ShareBookingForm dbId={id} defaultEmail={user.email} />
                </div>
            </div>
        </main>
    );
}
