import { listBookingsForAdmin, type AdminBookingView } from '@/lib/server/golf/bookings';
import { GolfBookingsClient } from './GolfBookingsClient';

export const dynamic = 'force-dynamic';

const VIEWS: readonly AdminBookingView[] = ['waiting', 'upcoming', 'past'];

/** Golf Bookings in the admin. The dashboard layout already refuses anyone who is not an admin. */
export default async function AdminGolfBookingsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const asked = typeof params.view === 'string' ? (params.view as AdminBookingView) : 'waiting';
    const view = VIEWS.includes(asked) ? asked : 'waiting';
    const bookings = await listBookingsForAdmin(view);
    return <GolfBookingsClient bookings={bookings} view={view} />;
}
