/**
 * POST /api/auth/reset-password
 * Initiates a password reset email.
 * Replaces Supabase Auth's /auth/v1/recover
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/auth/session';
import { getSqlAdmin } from '@/lib/db/postgres';
import { rateLimit } from '@/lib/server/rate-limit';
import { env } from '@/utils/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 3, windowMs: 60_000, prefix: 'auth-reset' });
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many reset requests.' }, { status: 429 });
    }

    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email required.' }, { status: 400 });

    const user = await getUserByEmail(email.toLowerCase());
    // Always return success to prevent email enumeration
    if (!user) return NextResponse.json({ success: true });

    const sql = getSqlAdmin();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await sql`
        INSERT INTO password_reset_tokens (user_id, token, expires_at)
        VALUES (${user.id}, ${token}, ${expiresAt})
        ON CONFLICT (user_id) DO UPDATE
        SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
    `;

    const resetUrl = `${env.SITE_URL}/auth/reset-password?token=${token}`;

    // Send email via Resend
    if (env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
                to: [user.email],
                subject: 'Reset your password',
                html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
            }),
        }).catch((e) => console.error('[auth/reset-password] Email failed:', e));
    }

    return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
    const { token, password } = await req.json();
    if (!token || !password) return NextResponse.json({ error: 'Token and password required.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Password must be 8+ characters.' }, { status: 400 });

    const sql = getSqlAdmin();
    const rows = await sql`
        SELECT user_id FROM password_reset_tokens
        WHERE token = ${token} AND expires_at > NOW()
    `;
    if (rows.length === 0) {
        return NextResponse.json({ error: 'Invalid or expired reset token.' }, { status: 400 });
    }
    const userId = rows[0].user_id;

    const { updatePassword } = await import('@/lib/auth/session');
    await updatePassword(userId, password);

    await sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`;

    return NextResponse.json({ success: true });
}
