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
        // The booking is already enriched by getBookingsList, but we add revenue-dashboard specific splits here
        const b = booking as any;
        const markupAmount = b.markupAmount;
        
        // Logical split for display: 70% Platform, 30% Operational Margin
        const markupPlatform = markupAmount * 0.7;
        const markupMargin = markupAmount * 0.3;

        // Strip processing/fixed breakdown
        const stripeFeeProcessing = b.totalAmount * 0.029;
        const stripeFeeFixed = 0.30;

        return {
            ...b,
            markupPlatform,
            markupMargin,
            stripeFeeProcessing,
            stripeFeeFixed,
            netProfit: b.profit // getBookingsList already calculated profit after fees
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
