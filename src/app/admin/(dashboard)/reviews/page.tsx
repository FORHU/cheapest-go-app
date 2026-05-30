import { createAdminClient } from '@/utils/supabase/admin';
import { ReviewsClient } from './ReviewsClient';

export const dynamic = 'force-dynamic';

export default async function AdminReviewsPage({
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

    let query = supabase.from('hotel_reviews').select('*', { count: 'exact' });
    if (q) query = query.or(`hotel_id.ilike.%${q}%,reviewer_name.ilike.%${q}%`);

    const { data, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    const [{ count: totalCount }, { count: recentCount }] = await Promise.all([
        supabase.from('hotel_reviews').select('*', { count: 'exact', head: true }),
        supabase
            .from('hotel_reviews')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    return (
        <ReviewsClient
            data={{
                reviews: data ?? [],
                total: count ?? 0,
                page,
                pageSize,
                totalPages: Math.ceil((count ?? 0) / pageSize),
                stats: {
                    total: totalCount ?? 0,
                    lastWeek: recentCount ?? 0,
                },
            }}
            searchParams={{ page, q }}
        />
    );
}
