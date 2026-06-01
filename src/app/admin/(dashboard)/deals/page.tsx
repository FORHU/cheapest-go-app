import { createAdminClient } from '@/utils/postgres/admin';
import { createAdminClient } from '@/utils/supabase/admin';
import { DealsClient } from './DealsClient';

export const dynamic = 'force-dynamic';

export default async function AdminDealsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const tab = typeof params.tab === 'string' ? params.tab : 'vouchers';
    const page = typeof params.page === 'string' ? parseInt(params.page) : 1;
    const q = typeof params.q === 'string' ? params.q : '';
    const pageSize = 20;
    const offset = (Math.max(1, page) - 1) * pageSize;

    const supabase = createAdminClient();

    let data: any[] = [];
    let count = 0;

    if (tab === 'vouchers') {
        let query = supabase.from('vouchers').select('*', { count: 'exact' });
        if (q) query = query.or(`code.ilike.%${q}%,description.ilike.%${q}%`);
        const res = await query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
        data = res.data ?? [];
        count = res.count ?? 0;

        // Attach usage counts
        const { data: usage } = await supabase.from('voucher_usage').select('voucher_id');
        const usageMap: Record<string, number> = {};
        (usage ?? []).forEach((u: any) => { usageMap[u.voucher_id] = (usageMap[u.voucher_id] ?? 0) + 1; });
        data = data.map((v: any) => ({ ...v, times_used: usageMap[v.id] ?? v.times_used ?? 0 }));
    } else if (tab === 'flight_deals') {
        let query = supabase.from('flight_deals').select('*', { count: 'exact' });
        if (q) query = query.or(`origin.ilike.%${q}%,destination.ilike.%${q}%,airline.ilike.%${q}%`);
        const res = await query.order('updated_at', { ascending: false }).range(offset, offset + pageSize - 1);
        data = res.data ?? [];
        count = res.count ?? 0;
    } else if (tab === 'weekend_deals') {
        let query = supabase.from('weekend_flight_deals').select('*', { count: 'exact' });
        if (q) query = query.or(`name.ilike.%${q}%,location.ilike.%${q}%`);
        const res = await query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
        data = res.data ?? [];
        count = res.count ?? 0;
    }

    // Summary counts across all tabs
    const [{ count: voucherTotal }, { count: flightDealTotal }, { count: weekendTotal }, { count: activeVouchers }] = await Promise.all([
        supabase.from('vouchers').select('*', { count: 'exact', head: true }),
        supabase.from('flight_deals').select('*', { count: 'exact', head: true }),
        supabase.from('weekend_flight_deals').select('*', { count: 'exact', head: true }),
        supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('active', true),
    ]);

    return (
        <DealsClient
            data={{
                items: data,
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
                stats: {
                    vouchers: voucherTotal ?? 0,
                    activeVouchers: activeVouchers ?? 0,
                    flightDeals: flightDealTotal ?? 0,
                    weekendDeals: weekendTotal ?? 0,
                },
            }}
            searchParams={{ tab, page, q }}
        />
    );
}
