/**
 * PATCH /api/account/profile
 * Updates the authenticated user's first/last name in the users table.
 *
 * Replaces the previous flow that POSTed name fields to /api/preferences —
 * which 405'd (that route only accepts GET/PATCH) and, even when reachable,
 * wrote the name into the profiles.preferences JSON blob instead of the
 * canonical users.first_name / users.last_name columns.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getSqlAdmin } from '@/lib/db/postgres';
import { profileSchema } from '@/lib/schemas/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
    const { user, error } = await getAuthenticatedUser();
    if (error || !user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : undefined;
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : undefined;

    if (firstName === undefined && lastName === undefined) {
        return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    // The same rule the forms use, enforced here because this route is the authority: a
    // 13,708-character first name reached the database through it (QA BG-9). Each field is
    // checked on its own, since either may be absent from a partial update.
    const nameField = profileSchema.shape.firstName;
    for (const [label, value] of [['First name', firstName], ['Last name', lastName]] as const) {
        if (value === undefined) continue;
        const parsed = nameField.safeParse(value);
        if (!parsed.success) {
            const message = parsed.error.issues[0]?.message ?? 'Invalid name';
            return NextResponse.json({ error: message.replace('First name', label) }, { status: 400 });
        }
    }

    const sql = getSqlAdmin();
    const rows = await sql`
        UPDATE users
        SET first_name = COALESCE(${firstName ?? null}, first_name),
            last_name  = COALESCE(${lastName ?? null}, last_name),
            updated_at = NOW()
        WHERE id = ${user.id}
        RETURNING first_name, last_name
    `;

    if (rows.length === 0) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    return NextResponse.json({
        user: { firstName: rows[0].first_name, lastName: rows[0].last_name },
    });
}
