import type { Metadata } from 'next';
import { BookingDestinationView } from '@/components/booking/destination/BookingDestinationView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Your Destination',
    robots: { index: false, follow: false },
};

export default function BookingDestinationPage() {
    return <BookingDestinationView />;
}
