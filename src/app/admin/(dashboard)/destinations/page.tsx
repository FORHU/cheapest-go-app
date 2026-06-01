import { createAdminClient } from '@/utils/postgres/admin';
import { createAdminClient } from '@/utils/supabase/admin';
import { DestinationsClient } from './DestinationsClient';

export const dynamic = 'force-dynamic';

export default async function AdminDestinationsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const page = typeof params.page === 'string' ? parseInt(params.page) : 1;
    const q = typeof params.q === 'string' ? params.q : '';
    const pageSize = 20;
    const offset = (Math.max(1, page) - 1) * pageSize;

    const supabase = createAdminClient();

    let query = supabase.from('popular_destinations').select('*', { count: 'exact' });
    if (q) query = query.or(`city.ilike.%${q}%,country.ilike.%${q}%`);

    const { data, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    return (
        <DestinationsClient
            data={{
                destinations: data ?? [],
                total: count ?? 0,
                page,
                pageSize,
                totalPages: Math.ceil((count ?? 0) / pageSize),
            }}
            searchParams={{ page, q }}
        />
    );
}
