import { getBookingsList } from '@/lib/server/admin';
import { getAdminSettings } from '@/lib/server/admin/settings';
import { RevenueClient } from './RevenueClient';
import { calculateStripeFee, STRIPE_RATE, STRIPE_FLAT_FEE } from '@/lib/pricing';

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

    const enrichedBookings = rawData.bookings.map(booking => {
        // The booking is already enriched by getBookingsList, but we add revenue-dashboard specific splits here
        const b = booking as any;
        const markupAmount = b.markupAmount;

        // The whole markup is cost recovery, so all of it is "platform" and none of it is
        // margin. This used to split it 70/30 into "Platform" and "Operational Margin",
        // which was a display convention with nothing behind it — the 30% was never earned
        // and, since the markup does not even cover Duffel's monthly invoice on the old
        // rates, was money already spent. See ADR-0036.
        const markupPlatform = markupAmount;
        const markupMargin = 0;

        // Stripe processing/fixed breakdown. Derived from the same constants the pricing
        // model uses, so a corrected STRIPE_RATE moves reporting and pricing together
        // rather than leaving the dashboard quoting a rate nothing charges.
        const stripeFeeFixed = STRIPE_FLAT_FEE;
        const stripeFeeProcessing = b.totalAmount * STRIPE_RATE;

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
