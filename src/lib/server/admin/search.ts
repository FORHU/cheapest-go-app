import { createAdminClient } from '@/utils/supabase/admin';

export interface SearchResult {
    id: string;
    category: 'booking' | 'customer' | 'user';
    title: string;
    subtitle: string;
    status?: string;
    href: string;
    meta?: Record<string, string>;
}

export interface SearchResponse {
    bookings: SearchResult[];
    customers: SearchResult[];
    users: SearchResult[];
}

export async function searchAdmin(query: string): Promise<SearchResponse> {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) {
        return { bookings: [], customers: [], users: [] };
    }

    const supabase = createAdminClient();
    const pattern = `%${q}%`;

    const [bookings, customers, users] = await Promise.all([
        searchBookings(supabase, pattern, q),
        searchCustomers(supabase, pattern),
        searchUsers(supabase, pattern),
    ]);

    return { bookings, customers, users };
}

async function searchBookings(supabase: ReturnType<typeof createAdminClient>, pattern: string, q: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // unified_bookings — search by external_id (booking ref) and provider
    const [unifiedRes, legacyHotelRes, legacyFlightRes] = await Promise.all([
        supabase
            .from('unified_bookings')
            .select('id, external_id, type, provider, status, total_price, currency, metadata, created_at')
            .or(`external_id.ilike.${pattern}`)
            .order('created_at', { ascending: false })
            .limit(5),
        supabase
            .from('bookings')
            .select('id, booking_id, status, total_price, currency, holder_first_name, holder_last_name, holder_email, created_at')
            .or(`booking_id.ilike.${pattern},holder_first_name.ilike.${pattern},holder_last_name.ilike.${pattern},holder_email.ilike.${pattern}`)
            .order('created_at', { ascending: false })
            .limit(5),
        supabase
            .from('flight_bookings')
            .select('id, pnr, provider, status, total_price, currency, created_at')
            .or(`pnr.ilike.${pattern}`)
            .order('created_at', { ascending: false })
            .limit(5),
    ]);

    for (const item of unifiedRes.data || []) {
        const meta = item.metadata as any;
        const name = meta?.passengers?.[0]
            ? `${meta.passengers[0].firstName} ${meta.passengers[0].lastName}`
            : meta?.holder
                ? `${meta.holder.firstName} ${meta.holder.lastName}`
                : '';
        const ref = item.external_id || item.id.slice(0, 8).toUpperCase();
        results.push({
            id: item.id,
            category: 'booking',
            title: ref,
            subtitle: name.trim() || item.type,
            status: item.status,
            href: `/admin/bookings?q=${encodeURIComponent(ref)}`,
            meta: { type: item.type, provider: item.provider },
        });
    }

    for (const item of legacyHotelRes.data || []) {
        const name = `${item.holder_first_name || ''} ${item.holder_last_name || ''}`.trim();
        results.push({
            id: item.id,
            category: 'booking',
            title: item.booking_id,
            subtitle: name || item.holder_email || 'Hotel booking',
            status: item.status,
            href: `/admin/bookings?q=${encodeURIComponent(item.booking_id)}`,
            meta: { type: 'hotel', provider: 'legacy' },
        });
    }

    for (const item of legacyFlightRes.data || []) {
        results.push({
            id: item.id,
            category: 'booking',
            title: item.pnr,
            subtitle: `${item.provider} flight`,
            status: item.status === 'booked' ? 'confirmed' : item.status,
            href: `/admin/bookings?q=${encodeURIComponent(item.pnr)}`,
            meta: { type: 'flight', provider: item.provider },
        });
    }

    // Sort by most recent, take top 5
    return results.slice(0, 5);
}

async function searchCustomers(supabase: ReturnType<typeof createAdminClient>, pattern: string): Promise<SearchResult[]> {
    const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .eq('role', 'user')
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(5);

    return (data || []).map(p => ({
        id: p.id,
        category: 'customer' as const,
        title: p.full_name || 'Anonymous',
        subtitle: p.email,
        href: '/admin/customers',
    }));
}

async function searchUsers(supabase: ReturnType<typeof createAdminClient>, pattern: string): Promise<SearchResult[]> {
    const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(5);

    return (data || []).map(p => ({
        id: p.id,
        category: 'user' as const,
        title: p.full_name || 'Anonymous',
        subtitle: p.email,
        href: '/admin/users',
        meta: { role: p.role },
    }));
}
