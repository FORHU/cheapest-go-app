import { createAdminClient } from '@/utils/postgres/admin';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { createAdminClient } from '@/utils/supabase/admin';
import { getAdminSettings, saveAdminSettings } from '@/lib/server/admin/settings';
import { rateLimit } from '@/lib/server/rate-limit';
import { env } from '@/utils/env';
import { generateMobileApiKey, invalidateMobileKeyCache } from '@/lib/server/mobile-auth';
import { logAdminAction } from '@/lib/server/admin/audit';

export const dynamic = 'force-dynamic';

// ── GET — dashboard data ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'admin-mobile-get' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const supabase = createAdminClient();
    const cfg = await getAdminSettings();

    const [
        { data: bookings, count: totalCount },
        { count: confirmedCount },
        { count: pendingCount },
        { count: failedCount },
        { data: deviceRows, count: deviceCount },
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
        supabase.from('device_push_tokens')
            .select('platform', { count: 'exact' })
            .order('updated_at', { ascending: false })
            .limit(5),
    ]);

    // DB key (masked) vs env var key (masked)
    const dbApiKey: string | null = typeof cfg.mobile_api_key === 'string' ? cfg.mobile_api_key : null;
    const envApiKey = env.MOBILE_API_KEY ?? null;
    const activeKey = dbApiKey ?? envApiKey;

    const mask = (k: string | null) =>
        k ? `${k.slice(0, 8)}${'•'.repeat(Math.min(24, k.length - 8))}` : null;

    return NextResponse.json({
        success: true,
        config: {
            apiKeySource:    dbApiKey ? 'database' : envApiKey ? 'env' : 'none',
            apiKeyPreview:   mask(activeKey),
            apiKeyConfigured: Boolean(activeKey),
            guestUserConfigured: Boolean(env.MOBILE_GUEST_USER_ID),
            guestUserId:     env.MOBILE_GUEST_USER_ID ?? null,
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
        recentDevices: deviceRows ?? [],
        bookings:  bookings ?? [],
        total:     totalCount ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((totalCount ?? 0) / pageSize),
    });
}

// ── POST — actions ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000, prefix: 'admin-mobile-post' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = await req.json();
    const { action } = body;

    // ── 1. Rotate API key ────────────────────────────────────────────────
    if (action === 'rotate_api_key') {
        const newKey = generateMobileApiKey();

        const result = await saveAdminSettings({ mobile_api_key: newKey });
        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        invalidateMobileKeyCache();

        logAdminAction({
            action: 'rotate_mobile_api_key',
            adminId: auth.user.id,
            adminEmail: auth.user.email,
            details: { note: 'Key rotated and stored in admin_settings' },
        });

        // Return the new key ONCE — it cannot be retrieved again in plain text
        return NextResponse.json({ success: true, newKey });
    }

    // ── 2. Send push notification ────────────────────────────────────────
    if (action === 'send_push') {
        const { title, body: msgBody, data = {}, target = 'all', userId } = body;

        if (!title || !msgBody) {
            return NextResponse.json({ success: false, error: 'title and body are required' }, { status: 400 });
        }

        const supabase = createAdminClient();

        let query = supabase.from('device_push_tokens').select('expo_push_token');
        if (target === 'user' && userId) {
            query = query.eq('user_id', userId);
        }

        const { data: tokens, error: tokenErr } = await query;
        if (tokenErr) return NextResponse.json({ success: false, error: tokenErr.message }, { status: 500 });
        if (!tokens?.length) return NextResponse.json({ success: false, error: 'No registered devices found' }, { status: 404 });

        // Batch into chunks of 100 (Expo limit)
        const CHUNK = 100;
        const messages = tokens.map((t: { expo_push_token: string }) => ({
            to:    t.expo_push_token,
            title,
            body:  msgBody,
            data,
            sound: 'default',
        }));

        const results: any[] = [];
        for (let i = 0; i < messages.length; i += CHUNK) {
            const chunk = messages.slice(i, i + CHUNK);
            const res = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(chunk),
            });
            const json = await res.json().catch(() => ({}));
            results.push(...(json.data ?? [json]));
        }

        logAdminAction({
            action: 'send_push_notification',
            adminId: auth.user.id,
            adminEmail: auth.user.email,
            details: { title, target, devicesReached: tokens.length },
        });

        const errors = results.filter(r => r.status === 'error');
        return NextResponse.json({
            success: true,
            sent: tokens.length,
            errors: errors.length,
            errorDetails: errors.slice(0, 5),
        });
    }

    // ── 3. Update version config ─────────────────────────────────────────
    if (action === 'update_version') {
        const { minVersion, latestVersion, forceUpdate, updateMessage } = body;

        const updates: Record<string, unknown> = {};
        if (minVersion    !== undefined) updates.mobile_min_version    = minVersion;
        if (latestVersion !== undefined) updates.mobile_latest_version = latestVersion;
        if (forceUpdate   !== undefined) updates.mobile_force_update   = forceUpdate;
        if (updateMessage !== undefined) updates.mobile_update_message = updateMessage;

        if (!Object.keys(updates).length) {
            return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
        }

        const result = await saveAdminSettings(updates);
        if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 500 });

        logAdminAction({
            action: 'update_mobile_version_config',
            adminId: auth.user.id,
            adminEmail: auth.user.email,
            details: updates,
        });

        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
