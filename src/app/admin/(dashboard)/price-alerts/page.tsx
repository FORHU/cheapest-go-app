import { createAdminClient } from '@/utils/postgres/admin';
import { PriceAlertsClient } from './PriceAlertsClient';

export const dynamic = 'force-dynamic';

export default async function AdminPriceAlertsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const page = typeof params.page === 'string' ? parseInt(params.page) : 1;
    const q = typeof params.q === 'string' ? params.q : '';
    const status = typeof params.status === 'string' ? params.status : 'all';
    const pageSize = 20;
    const offset = (Math.max(1, page) - 1) * pageSize;

    const supabase = createAdminClient();

    let query = supabase
        .from('price_alerts')
        .select('*', { count: 'exact' });

    if (status === 'active') query = query.eq('is_active', true);
    else if (status === 'inactive') query = query.eq('is_active', false);
    if (q) query = query.or(`origin.ilike.%${q}%,destination.ilike.%${q}%,email.ilike.%${q}%`);

    const { data, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    // Summary stats
    const [{ count: activeCount }, { count: totalCount }] = await Promise.all([
        supabase.from('price_alerts').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('price_alerts').select('*', { count: 'exact', head: true }),
    ]);

    return (
        <PriceAlertsClient
            data={{
                alerts: data ?? [],
                total: count ?? 0,
                page,
                pageSize,
                totalPages: Math.ceil((count ?? 0) / pageSize),
                stats: {
                    total: totalCount ?? 0,
                    active: activeCount ?? 0,
                    inactive: (totalCount ?? 0) - (activeCount ?? 0),
                },
            }}
            searchParams={{ page, q, status }}
        />
    );
}
