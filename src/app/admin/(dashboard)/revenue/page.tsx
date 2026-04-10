import { getBookingsList } from '@/lib/server/admin';
import { getAdminSettings } from '@/lib/server/admin/settings';
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

    const [rawData, settings] = await Promise.all([
        getBookingsList({
            page,
            searchTerm,
            status,
            supplier,
            type,
            pageSize: 50
        }),
        getAdminSettings()
    ]);

    // Set fixed markup percentages based on type as per policy, not calculated from raw numbers
    const enrichedBookings = rawData.bookings.map(booking => {
        let markupPercentage = 15; // default hotel
        if (booking.type === 'flight') markupPercentage = 8;
        if (booking.type === 'bundle' || booking.type === 'hotel_bundle') markupPercentage = 12;

        // Determine actual markup amount. If DB says 0, try to derive it from supplier cost.
        // If supplier cost is same as total (legacy flat), use policy fallback.
        let markupAmount = booking.markupAmount;
        if (markupAmount === 0) {
            if (booking.supplierCost > 0 && booking.supplierCost < booking.totalAmount) {
                markupAmount = booking.totalAmount - booking.supplierCost;
            } else {
                // Theoretical fallback based on policy: markup = total * (rate / (1+rate))
                const rate = markupPercentage / 100;
                markupAmount = booking.totalAmount * (rate / (1 + rate));
            }
        }

        const stripeFee = calculateStripeFee(booking.totalAmount);
        const stripeFeeProcessing = booking.totalAmount * 0.029;
        const stripeFeeFixed = 0.30;
        
        const netProfit = markupAmount - stripeFee;
        
        // Logical split for display: 70% Platform, 30% Operational Margin
        const markupPlatform = markupAmount * 0.7;
        const markupMargin = markupAmount * 0.3;

        return {
            ...booking,
            markupAmount,
            markupPlatform,
            markupMargin,
            stripeFee,
            stripeFeeProcessing,
            stripeFeeFixed,
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
            defaultCurrency={settings.default_currency || 'USD'}
        />
    );
}
