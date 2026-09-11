import { NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';

export const dynamic = 'force-dynamic';

// GeomeeGo is accepted alongside AirangGo, its name until the 2026-09 rebrand: an admin
// page loaded before the rename can still POST the old value, and rejecting it would fail
// the switch with no explanation. brand-filter.ts maps it to AirangGo when reading.
const VALID_BRANDS = ['CheapestGo', 'AirangGo', 'GeomeeGo', 'all'];

export async function POST(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { brand } = await req.json();
    if (!VALID_BRANDS.includes(brand)) {
        return NextResponse.json({ error: 'Invalid brand' }, { status: 400 });
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set('admin_brand_view', brand, {
        path: '/',
        httpOnly: false, // readable by client JS for the active-tab indicator
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
    });
    return res;
}
