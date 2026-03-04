import { getBookingsList } from '@/lib/server/adminActions';
import { BookingsClient } from './BookingsClient';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage() {
    const bookings = await getBookingsList();

    return <BookingsClient initialBookings={bookings} />;
}
