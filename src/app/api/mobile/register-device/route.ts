import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/postgres/admin';
import { env } from '@/utils/env';
import { getMobileApiKey } from '@/lib/server/mobile-auth';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mobile/register-device
 *
 * Registers an Expo push token for a device so the admin can send
 * push notifications to mobile users.
 *
 * Auth: X-Mobile-Api-Key (same as booking endpoints)
 * Body: { expoPushToken, platform, appVersion, userId? }
 */
export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'mobile-register-device' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const apiKey = req.headers.get('x-mobile-api-key');
    const activeKey = await getMobileApiKey();
    if (!apiKey || !activeKey || apiKey !== activeKey) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    const { expoPushToken, platform = 'ios', appVersion, userId } = body;

    if (typeof expoPushToken !== 'string' || !expoPushToken.startsWith('ExponentPushToken[')) {
        return NextResponse.json({ success: false, error: 'Invalid Expo push token format' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
        .from('device_push_tokens')
        .upsert({
            expo_push_token: expoPushToken,
            user_id:         userId ?? null,
            platform:        ['ios', 'android', 'web'].includes(platform as string) ? platform : 'ios',
            app_version:     typeof appVersion === 'string' ? appVersion : null,
            updated_at:      new Date().toISOString(),
        }, { onConflict: 'expo_push_token' });

    if (error) {
        console.error('[register-device]', error.message);
        return NextResponse.json({ success: false, error: 'Failed to register device' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
