import { getBookingsList } from '@/lib/server/admin';
import { RevenueClient } from './RevenueClient';
import { calculateStripeFee } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function AdminRevenuePage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const resolvedParams = await searchParams;
    const page = typeof resolvedParams.page === 'string' ? parseInt(resolvedParams.page) : 1;
    const searchTerm = typeof resolvedParams.q === 'string' ? resolvedParams.q : '';
    const status = typeof resolvedParams.status === 'string' ? resolvedParams.status : 'all';
    const supplier = typeof resolvedParams.supplier === 'string' ? resolvedParams.supplier : 'all';
    const type = typeof resolvedParams.type === 'string' ? resolvedParams.type : 'all';

    const rawData = await getBookingsList({
        page,
        searchTerm,
        status,
        supplier,
        type,
        pageSize: 50
    });

    // Set fixed markup percentages based on type as per policy, not calculated from raw numbers
    const enrichedBookings = rawData.bookings.map(booking => {
        const stripeFee = calculateStripeFee(booking.totalAmount);
        const netProfit = booking.markupAmount - stripeFee;
        
        let markupPercentage = 15; // default hotel
        if (booking.type === 'flight') markupPercentage = 8;
        if (booking.type === 'bundle' || booking.type === 'hotel_bundle') markupPercentage = 12;

        return {
            ...booking,
            stripeFee,
            netProfit,
            markupPercentage
        };
    });

    return (
        <RevenueClient
            data={{
                ...rawData,
                bookings: enrichedBookings as any
            }}
            searchParams={{
                page,
                q: searchTerm,
                status,
                supplier,
                type
            }}
        />
    );
}
