import { getBookingsList } from '@/lib/server/admin';
import { BookingsClient } from './BookingsClient';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const resolvedParams = await searchParams;
    const page = typeof resolvedParams.page === 'string' ? parseInt(resolvedParams.page) : 1;
    const searchTerm = typeof resolvedParams.q === 'string' ? resolvedParams.q : '';
    const status = typeof resolvedParams.status === 'string' ? resolvedParams.status : 'all';
    const supplier = typeof resolvedParams.supplier === 'string' ? resolvedParams.supplier : 'all';
    const paymentStatus = typeof resolvedParams.payment === 'string' ? resolvedParams.payment : 'all';
    const type = typeof resolvedParams.type === 'string' ? resolvedParams.type : 'all';

    const data = await getBookingsList({
        page,
        searchTerm,
        status,
        supplier,
        paymentStatus,
        type
    });

    return (
        <BookingsClient
            data={data}
            searchParams={{
                page,
                q: searchTerm,
                status,
                supplier,
                payment: paymentStatus,
                type
            }}
        />
    );
}
