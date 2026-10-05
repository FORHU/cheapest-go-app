import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { listAvailableTeeTimes } from '@/lib/server/golf/teeTimes';
import { isIsoDate } from '@/lib/golf/time';

export const dynamic = 'force-dynamic';

/** Open tee times on one course-local date, for the course page's picker. Public. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'golf-tee-times' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const { slug } = await params;
    const date = new URL(req.url).searchParams.get('date') ?? '';
    if (!isIsoDate(date)) {
        return NextResponse.json({ success: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const availability = await listAvailableTeeTimes(slug, date);
    if (!availability) return NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: availability });
}
