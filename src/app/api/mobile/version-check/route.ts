import { NextResponse } from 'next/server';
import { getAdminSettings } from '@/lib/server/admin/settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/version-check
 *
 * Public endpoint — no auth required.
 * The mobile app calls this on startup to determine if an update is needed.
 *
 * Response:
 *   { minVersion, latestVersion, forceUpdate, updateMessage }
 */
export async function GET() {
    const cfg = await getAdminSettings();

    return NextResponse.json({
        minVersion:    cfg.mobile_min_version    ?? '1.0.0',
        latestVersion: cfg.mobile_latest_version ?? '1.0.0',
        forceUpdate:   cfg.mobile_force_update   ?? false,
        updateMessage: cfg.mobile_update_message ?? 'A new version of CheapestGo is available.',
    });
}
