import { createAdminClient } from '@/utils/postgres/admin';
import { getAdminSettings } from '@/lib/server/admin/settings';
import { env } from '@/utils/env';
import { MobileClient } from './MobileClient';

export const dynamic = 'force-dynamic';

export default async function AdminMobilePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const page = typeof params.page === 'string' ? parseInt(params.page) : 1;
    const pageSize = 20;
    const offset = (Math.max(1, page) - 1) * pageSize;

    const supabase = createAdminClient();
    const cfg = await getAdminSettings();

    const [
        { data: bookings, count: totalCount },
        { count: confirmedCount },
        { count: pendingCount },
        { count: failedCount },
        { count: deviceCount },
    ] = await Promise.all([
        supabase
            .from('flight_bookings')
            .select('id, pnr, status, payment_intent_id, created_at, session_id', { count: 'exact' })
            .eq('provider', 'duffel')
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true })
            .eq('provider', 'duffel').in('status', ['confirmed', 'ticketed', 'booked']),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true })
            .eq('provider', 'duffel').in('status', ['pending', 'awaiting_ticket']),
        supabase.from('flight_bookings').select('*', { count: 'exact', head: true })
            .eq('provider', 'duffel').eq('status', 'failed'),
        supabase.from('device_push_tokens').select('*', { count: 'exact', head: true }),
    ]);

    const dbApiKey: string | null = typeof cfg.mobile_api_key === 'string' ? cfg.mobile_api_key : null;
    const envApiKey = env.MOBILE_API_KEY ?? null;
    const activeKey = dbApiKey ?? envApiKey;

    const mask = (k: string | null) =>
        k ? `${k.slice(0, 8)}${'•'.repeat(Math.min(24, k.length - 8))}` : null;

    return (
        <MobileClient
            data={{
                config: {
                    apiKeySource:     dbApiKey ? 'database' : envApiKey ? 'env' : 'none',
                    apiKeyPreview:    mask(activeKey),
                    apiKeyConfigured: Boolean(activeKey),
                    guestUserConfigured: Boolean(env.MOBILE_GUEST_USER_ID),
                    guestUserId:      env.MOBILE_GUEST_USER_ID ?? null,
                },
                versionConfig: {
                    minVersion:    cfg.mobile_min_version    ?? '1.0.0',
                    latestVersion: cfg.mobile_latest_version ?? '1.0.0',
                    forceUpdate:   cfg.mobile_force_update   ?? false,
                    updateMessage: cfg.mobile_update_message ?? '',
                },
                stats: {
                    total:     totalCount ?? 0,
                    confirmed: confirmedCount ?? 0,
                    pending:   pendingCount ?? 0,
                    failed:    failedCount ?? 0,
                    devices:   deviceCount ?? 0,
                },
                bookings:  bookings ?? [],
                total:     totalCount ?? 0,
                page,
                pageSize,
                totalPages: Math.ceil((totalCount ?? 0) / pageSize),
            }}
        />
    );
}
