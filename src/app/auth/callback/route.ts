import { createClient } from '@/utils/supabase/server';
import { getUserProfile } from '@/lib/server/auth';
import { NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';

/** Only allow relative paths — blocks protocol-relative URLs and external redirects. */
function validateRedirectUrl(url: string): string {
    if (!url.startsWith('/') || url.startsWith('//') || url.includes('://')) {
        return '/';
    }
    return url;
}

/** Determines the redirect target based on user role and requested 'next' path. */
async function getRedirectTarget(user: any, next: string): Promise<string> {
    // 1. Check metadata (fastest)
    if (user?.user_metadata?.role === 'admin' || user?.app_metadata?.role === 'admin') {
        return '/admin';
    }

    // 2. Check database (reliable fallback)
    const profile = await getUserProfile(user.id);
    if (profile?.role === 'admin') {
        return '/admin';
    }

    return next;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Determine the correct origin — inside Docker, request.url uses the
    // container hostname (0.0.0.0) which is unreachable from the browser.
    // Prefer forwarded headers from the reverse proxy, then NEXT_PUBLIC_SITE_URL.
    const origin = (() => {
        const fwdHost = request.headers.get('x-forwarded-host');
        const fwdProto = request.headers.get('x-forwarded-proto') || 'https';
        if (fwdHost) return `${fwdProto}://${fwdHost}`;

        const host = request.headers.get('host');
        if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
            return `${fwdProto}://${host}`;
        }

        if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

        return new URL(request.url).origin;
    })();

    // Handle OAuth code exchange
    const code = searchParams.get('code');

    // Handle email confirmation (token_hash and type)
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;

    // Check for error params (if Supabase sends an error directly)
    const error = searchParams.get('error');
    const error_code = searchParams.get('error_code');
    const error_description = searchParams.get('error_description');

    if (error) {
        console.error('Auth error:', error_code, error_description);
        return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(error_description || error)}`);
    }

    const next = validateRedirectUrl(searchParams.get('next') ?? '/');

    const supabase = await createClient();

    // Email confirmation flow (from "Confirm your mail" link)
    if (token_hash && type) {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });

        if (!verifyError && data.session) {
            const redirectTarget = await getRedirectTarget(data.session.user, next);
            return NextResponse.redirect(`${origin}${redirectTarget}`);
        }

        console.error('Email verification error:', verifyError?.message);
        return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(verifyError?.message || 'Verification failed')}`);
    }

    // OAuth code exchange flow (from Google/social login)
    if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (!exchangeError && data.session) {
            const redirectTarget = await getRedirectTarget(data.session.user, next);
            return NextResponse.redirect(`${origin}${redirectTarget}`);
        }

        console.error('Code exchange error:', exchangeError?.message);
        return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(exchangeError?.message || 'Session exchange failed')}`);
    }

    // Return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
