/**
 * POST /api/auth/signup
 * Replaces Supabase Auth's /auth/v1/signup
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUser, createUserSession, getUserByEmail } from '@/lib/auth/session';
import { rateLimit } from '@/lib/server/rate-limit';
import { MINIMUM_ACCOUNT_AGE, isAtLeastAge, isPlausibleBirthDate } from '@/lib/age';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'auth-signup' });
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many signup attempts.' }, { status: 429 });
    }

    try {
        const { email, password, firstName, lastName, birthDate } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
        }
        if (password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
        }

        // ── Age gate ──
        // Enforced server-side, not only in the form: booking creates a payment
        // contract, and a minor can disaffirm one. Checked here so an account can
        // never exist without having passed it.
        if (!birthDate) {
            return NextResponse.json({ error: 'Date of birth is required.' }, { status: 400 });
        }
        if (!isPlausibleBirthDate(birthDate)) {
            return NextResponse.json({ error: 'Please enter a valid date of birth.' }, { status: 400 });
        }
        if (!isAtLeastAge(birthDate)) {
            return NextResponse.json(
                { error: `You must be at least ${MINIMUM_ACCOUNT_AGE} years old to create an account.` },
                { status: 403 },
            );
        }

        const existing = await getUserByEmail(email.trim().toLowerCase());
        if (existing) {
            return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
        }

        const { id } = await createUser({
            email: email.trim().toLowerCase(),
            password,
            firstName,
            lastName,
            birthDate: String(birthDate).slice(0, 10),
        });

        await createUserSession(id);

        return NextResponse.json({ user: { id, email } }, { status: 201 });
    } catch (err: any) {
        console.error('[auth/signup]', err);
        return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
    }
}
