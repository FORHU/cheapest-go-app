import { createAdminClient } from '@/utils/supabase/admin';
import { SavedTripsClient } from './SavedTripsClient';

export const dynamic = 'force-dynamic';

export default async function AdminSavedTripsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const page = typeof params.page === 'string' ? parseInt(params.page) : 1;
    const q = typeof params.q === 'string' ? params.q : '';
    const type = typeof params.type === 'string' ? params.type : 'all';
    const pageSize = 20;
    const offset = (Math.max(1, page) - 1) * pageSize;

    const supabase = createAdminClient();

    let query = supabase.from('saved_trips').select('*', { count: 'exact' });
    if (type === 'flight' || type === 'hotel') query = query.eq('type', type);
    if (q) query = query.or(`title.ilike.%${q}%,subtitle.ilike.%${q}%`);

    const { data, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    const [{ count: totalCount }, { count: flightCount }, { count: hotelCount }] = await Promise.all([
        supabase.from('saved_trips').select('*', { count: 'exact', head: true }),
        supabase.from('saved_trips').select('*', { count: 'exact', head: true }).eq('type', 'flight'),
        supabase.from('saved_trips').select('*', { count: 'exact', head: true }).eq('type', 'hotel'),
    ]);

    return (
        <SavedTripsClient
            data={{
                trips: data ?? [],
                total: count ?? 0,
                page,
                pageSize,
                totalPages: Math.ceil((count ?? 0) / pageSize),
                stats: { total: totalCount ?? 0, flights: flightCount ?? 0, hotels: hotelCount ?? 0 },
            }}
            searchParams={{ page, q, type }}
        />
    );
}
