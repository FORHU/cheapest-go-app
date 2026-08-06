import { NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/server/admin';

export const dynamic = 'force-dynamic';

const VALID_BRANDS = ['CheapestGo', 'GeomeeGo', 'all'];

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
