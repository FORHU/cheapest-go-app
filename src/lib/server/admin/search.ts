import { createAdminClient } from '@/utils/postgres/admin';
import { getSqlAdmin } from '@/lib/db/postgres';
import { applyBrandFilter } from './brand-filter';

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
        searchCustomers(supabase, pattern, q),
        searchUsers(supabase, pattern, q),
    ]);

    return { bookings, customers, users };
}

async function searchBookings(supabase: ReturnType<typeof createAdminClient>, pattern: string, q: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const sql = getSqlAdmin();

    // unified_bookings — search by external_id (booking ref) and provider
    const [unifiedRes, legacyHotelRes, flightRows] = await Promise.all([
        applyBrandFilter(supabase.from('unified_bookings').select('id, external_id, type, provider, status, total_price, currency, metadata, created_at'))
            .or(`external_id.ilike.${pattern}`)
            .order('created_at', { ascending: false })
            .limit(5),
        applyBrandFilter(supabase.from('bookings').select('id, booking_id, status, total_price, currency, holder_first_name, holder_last_name, holder_email, created_at'))
            .or(`booking_id.ilike.${pattern},holder_first_name.ilike.${pattern},holder_last_name.ilike.${pattern},holder_email.ilike.${pattern}`)
            .order('created_at', { ascending: false })
            .limit(5),
        // Flight bookings: search PNR + passenger email/name via booking_sessions join
        sql`
            SELECT fb.id, fb.pnr, fb.provider, fb.status, fb.total_price, fb.currency, fb.created_at,
                   bs.contact->>'email' AS passenger_email,
                   bs.passengers->0->>'firstName' AS first_name,
                   bs.passengers->0->>'lastName' AS last_name
            FROM flight_bookings fb
            LEFT JOIN booking_sessions bs ON bs.id = fb.session_id
            WHERE fb.pnr ILIKE ${`%${q}%`}
               OR bs.contact->>'email' ILIKE ${`%${q}%`}
               OR bs.passengers->0->>'firstName' ILIKE ${`%${q}%`}
               OR bs.passengers->0->>'lastName' ILIKE ${`%${q}%`}
            ORDER BY fb.created_at DESC
            LIMIT 5
        `.catch(() => [] as any[]),
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

    for (const item of (Array.isArray(flightRows) ? flightRows : [])) {
        const name = `${item.first_name || ''} ${item.last_name || ''}`.trim();
        results.push({
            id: item.id,
            category: 'booking',
            title: item.pnr || item.id.slice(0, 8).toUpperCase(),
            subtitle: name || item.passenger_email || `${item.provider} flight`,
            status: item.status === 'booked' ? 'confirmed' : item.status,
            href: `/admin/bookings?q=${encodeURIComponent(item.pnr || item.id)}`,
            meta: { type: 'flight', provider: item.provider },
        });
    }

    // Sort by most recent, take top 5
    return results.slice(0, 5);
}

async function searchCustomers(_supabase: ReturnType<typeof createAdminClient>, _pattern: string, q: string): Promise<SearchResult[]> {
    const sql = getSqlAdmin();
    const rows = await sql`
        SELECT id, email, first_name, last_name
        FROM users
        WHERE role = 'user'
          AND (
              email ILIKE ${`%${q}%`}
              OR first_name ILIKE ${`%${q}%`}
              OR last_name ILIKE ${`%${q}%`}
              OR CONCAT(first_name, ' ', last_name) ILIKE ${`%${q}%`}
          )
        ORDER BY created_at DESC
        LIMIT 5
    `.catch(() => [] as any[]);

    return rows.map((p: any) => ({
        id: p.id,
        category: 'customer' as const,
        title: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
        subtitle: p.email,
        href: '/admin/customers',
    }));
}

async function searchUsers(_supabase: ReturnType<typeof createAdminClient>, _pattern: string, q: string): Promise<SearchResult[]> {
    const sql = getSqlAdmin();
    const rows = await sql`
        SELECT id, email, first_name, last_name, role
        FROM users
        WHERE email ILIKE ${`%${q}%`}
           OR first_name ILIKE ${`%${q}%`}
           OR last_name ILIKE ${`%${q}%`}
           OR CONCAT(first_name, ' ', last_name) ILIKE ${`%${q}%`}
        ORDER BY created_at DESC
        LIMIT 5
    `.catch(() => [] as any[]);

    return rows.map((p: any) => ({
        id: p.id,
        category: 'user' as const,
        title: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
        subtitle: p.email,
        href: '/admin/users',
        meta: { role: p.role },
    }));
}
