import { NextRequest, NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { getSqlAdmin } from '@/lib/db/postgres';
import { isUrgency } from '@/lib/server/support/urgency';

export const dynamic = 'force-dynamic';

/**
 * An Agent overruling computed Urgency, or putting it back.
 *
 * `null` is a real value here and not a missing one: it means "use the trip dates", which
 * is different from setting `normal`. Clearing an override hands the conversation back to a
 * rule that keeps moving on its own as a departure approaches; setting `normal` freezes it
 * at ordinary however close the flight gets. The screen offers both, so the route has to
 * distinguish them — hence an explicit `priority: null` rather than an absent field.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { priority?: unknown } | null;

    if (!body || !('priority' in body)) {
        return NextResponse.json(
            { error: 'priority is required; send null to restore the computed value' },
            { status: 400 },
        );
    }

    const value = body.priority;
    if (value !== null && !isUrgency(value)) {
        return NextResponse.json(
            { error: 'priority must be low, normal, high, critical, or null' },
            { status: 400 },
        );
    }

    const sql = getSqlAdmin();
    const rows = await sql<{ id: string }[]>`
        UPDATE support_conversations
           SET priority = ${value}
         WHERE id = ${id}
        RETURNING id
    `;
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ ok: true, priority: value });
}
