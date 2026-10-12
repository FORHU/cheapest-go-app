import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { listAvailableTeeTimes } from '@/lib/server/golf/teeTimes';
import { quoteGolf } from '@/lib/server/golf/quote';
import { isIsoDate } from '@/lib/golf/time';
import { DEFAULT_PLAYERS } from '@/lib/golf/search';

export const dynamic = 'force-dynamic';

/**
 * Open tee times on one course-local date, for the course page's picker. Public. Each carries the
 * all-in price per player for `players` (default 2), quoted the way checkout charges it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'golf-tee-times' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const { slug } = await params;
    const date = new URL(req.url).searchParams.get('date') ?? '';
    if (!isIsoDate(date)) {
        return NextResponse.json({ success: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const asked = Number(new URL(req.url).searchParams.get('players'));
    const players = Number.isInteger(asked) && asked >= 1 && asked <= 4 ? asked : DEFAULT_PLAYERS;

    const availability = await listAvailableTeeTimes(slug, date);
    if (!availability) return NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 });

    // A tee time we cannot price (no exchange rate) is left without an all-in figure, never guessed.
    const teeTimes = await Promise.all(availability.teeTimes.map(async tt => {
        try {
            const { total } = await quoteGolf({ greenFeeTotal: Math.round(tt.pricePerPlayer * players * 100) / 100, currency: tt.currency });
            return { ...tt, allInPerPlayer: Math.round((total / players) * 100) / 100 };
        } catch {
            return tt;
        }
    }));
    return NextResponse.json({ success: true, data: { ...availability, teeTimes } });
}
