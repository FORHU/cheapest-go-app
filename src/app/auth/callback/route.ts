/**
 * GET /auth/callback
 *
 * After migration this route handles:
 *   - Password reset confirmation (redirected from /api/auth/reset-password email link)
 *   - Future: OAuth provider callback (implement when OAuth providers are configured)
 *
 * No Supabase Auth dependency.
 */

import { NextResponse } from 'next/server';
import { getUserProfile } from '@/lib/server/auth';
import { getSession } from '@/lib/auth/session';

function validateRedirectUrl(url: string): string {
    if (!url.startsWith('/') || url.startsWith('//') || url.includes('://')) {
        return '/';
    }
    return url;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const origin = (() => {
        const fwdHost = request.headers.get('x-forwarded-host');
        const fwdProto = request.headers.get('x-forwarded-proto') || 'https';
        if (fwdHost) return `${fwdProto}://${fwdHost}`;
        return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    })();

    const next = validateRedirectUrl(searchParams.get('next') || '/');

    // Password reset token flow
    const resetToken = searchParams.get('token');
    if (resetToken) {
        // Redirect to the reset password page with the token
        return NextResponse.redirect(`${origin}/auth/reset-password?token=${resetToken}`);
    }

    // If user is already authenticated, redirect to their destination
    const { user } = await getSession();
    if (user) {
        const profile = await getUserProfile(user.id);
        const target = profile?.role === 'admin' ? '/admin' : next;
        return NextResponse.redirect(`${origin}${target}`);
    }

    // Default: redirect to login
    return NextResponse.redirect(`${origin}/login`);
}
