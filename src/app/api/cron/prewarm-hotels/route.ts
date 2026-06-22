import { NextRequest, NextResponse } from 'next/server';
import { prewarmPopularCities } from '@/lib/server/stays/travelgatex/prewarm';

export const dynamic = 'force-dynamic';

function toDateStr(d: Date): string {
    return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function nextWeekdayFrom(from: Date, targetDay: number /* 0=Sun…6=Sat */): Date {
    const d = new Date(from);
    const current = d.getDay();
    const delta = ((targetDay - current + 7) % 7) || 7; // at least 1 day ahead
    return addDays(d, delta);
}

function buildWindows(now: Date) {
    const friday1   = nextWeekdayFrom(now, 5);
    const saturday1 = addDays(friday1, 1);
    const friday2   = addDays(friday1, 7);

    return [
        { checkIn: toDateStr(friday1),   checkOut: toDateStr(addDays(friday1,   2)) }, // Fri→Sun
        { checkIn: toDateStr(saturday1), checkOut: toDateStr(addDays(saturday1, 2)) }, // Sat→Mon
        { checkIn: toDateStr(friday2),   checkOut: toDateStr(addDays(friday2,   2)) }, // next Fri→Sun
    ];
}

export async function GET(req: NextRequest) {
    const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const windows = buildWindows(new Date());
    console.log('[prewarm-hotels] Starting prewarm for windows:', windows);

    const windowResults = await Promise.allSettled(
        windows.map(w => prewarmPopularCities(w.checkIn, w.checkOut)),
    );

    const summary = windowResults.map((r, i) => ({
        window:  windows[i],
        status:  r.status,
        results: r.status === 'fulfilled' ? r.value : String((r as PromiseRejectedResult).reason),
    }));

    const totalHits = windowResults.reduce((acc, r) =>
        acc + (r.status === 'fulfilled' ? r.value.filter(x => x.status === 'fulfilled').length : 0), 0,
    );

    console.log(`[prewarm-hotels] Done — ${totalHits} city/window combinations prewarmed`);
    return NextResponse.json({ prewarmed: summary, totalHits });
}
