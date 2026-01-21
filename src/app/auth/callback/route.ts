import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);

    // Log all incoming parameters for debugging
    console.log('=== Auth Callback ===');
    console.log('Full URL:', request.url);
    console.log('All params:', Object.fromEntries(searchParams.entries()));

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
        console.error('Auth error from Supabase:', { error, error_code, error_description });
        return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(error_description || error)}`);
    }

    const next = searchParams.get('next') ?? '/';

    const supabase = await createClient();

    // Email confirmation flow (from "Confirm your mail" link)
    if (token_hash && type) {
        console.log('Attempting OTP verification with:', { token_hash: token_hash.substring(0, 10) + '...', type });

        const { data, error: verifyError } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });

        console.log('OTP verification result:', { data, error: verifyError });

        if (!verifyError && data.session) {
            // Successfully verified - redirect to home as signed in
            console.log('Email verification successful!');
            return NextResponse.redirect(`${origin}${next}`);
        }

        // Token expired or invalid
        console.error('Email verification error:', verifyError);
        return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(verifyError?.message || 'Verification failed')}`);
    }

    // OAuth code exchange flow (from Google/social login)
    if (code) {
        console.log('Attempting code exchange');
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        console.log('Code exchange result:', { hasSession: !!data.session, error: exchangeError });

        if (!exchangeError && data.session) {
            console.log('OAuth login successful!');
            return NextResponse.redirect(`${origin}${next}`);
        }

        console.error('Code exchange error:', exchangeError);
        return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(exchangeError?.message || 'Session exchange failed')}`);
    }

    console.log('No valid auth parameters found');
    // Return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
