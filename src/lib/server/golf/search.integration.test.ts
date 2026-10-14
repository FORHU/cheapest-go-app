import { describe, it, expect, vi, afterAll } from 'vitest';

// Fixed "USD per 1 unit" rates, so a conversion here is exact and needs no network.
const fx = vi.hoisted(() => ({ rates: { USD: 1, PHP: 0.0175, KRW: 0.0007, THB: 0.03 } as Record<string, number> }));
vi.mock('@/lib/currency', () => ({
    EXCHANGE_RATES: fx.rates,
    refreshExchangeRates: vi.fn(async () => true),
    convertCurrencyStrict: (amount: number, from: string, to: string) => {
        if (from === to) return amount;
        if (!fx.rates[from] || !fx.rates[to]) throw new Error(`No exchange rate for ${from} or ${to}`);
        return (amount * fx.rates[from]) / fx.rates[to];
    },
}));

import type { GolfCourseInput, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { createCourse, setCourseStatus, deleteCourses } from './courses';
import { createSchedule } from './teeTimes';
import { searchCourses } from './search';
import { quoteGolf } from './quote';

/**
 * Search against a real database. Each run gets its own country, so the demo courses in a
 * developer's database never leak into an assertion. Skips when no database is reachable.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_tee_times LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const country = `Searchland ${run}`;
const created: string[] = [];
/** 08:00 on Sunday 6 January 2030 in Manila. */
const NOW = new Date('2030-01-06T00:00:00Z');

function input(over: Partial<GolfCourseInput> = {}): GolfCourseInput {
    return {
        name: `Search Test ${run} ${created.length}`, country, city: 'Manila',
        slug: `search-test-${run}-${created.length}`, address: null, description: '', holes: 18,
        par: null, greenFeeFrom: null, currency: 'USD', imageUrls: [], amenities: [],
        timezone: 'Asia/Manila', freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '',
        yardage: null, yearOpened: null, designer: null, grass: null, ...over,
    };
}

const daily: TeeTimeScheduleInput = {
    name: 'Daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '07:00', lastTee: '07:30',
    intervalMinutes: 10, spots: 4, pricePerPlayer: 2500,
};

async function published(over: Partial<GolfCourseInput> = {}, schedule: Partial<TeeTimeScheduleInput> = {}, publish = true) {
    const c = await createCourse(input(over));
    created.push(c.id);
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    await getSqlAdmin()`UPDATE golf_courses SET created_at = '2000-01-01' WHERE id = ${c.id}`;
    await createSchedule(c.id, { ...daily, ...schedule }, NOW);
    if (publish) await setCourseStatus(c.id, 'published');
    return c;
}

afterAll(async () => {
    if (created.length) await deleteCourses(created);
});

describe.skipIf(!reachable)('course search against a real database', () => {
    it('quotes the all-in price the way checkout does, with the first tee times as chips', async () => {
        const c = await published();
        const results = await searchCourses({ country, date: '2030-01-08', players: 2 }, NOW);
        expect(results).toHaveLength(1);
        const [r] = results;
        expect(r.course.id).toBe(c.id);
        expect(r.matches).toBe(true);
        expect(r.teeTimes.map(t => t.localTime)).toEqual(['07:00', '07:10', '07:20', '07:30']);

        const quote = await quoteGolf({ greenFeeTotal: 5000, currency: 'USD' });
        expect(r.from).toMatchObject({ total: quote.total, perPlayer: Math.round((quote.total / 2) * 100) / 100, currency: 'USD' });
        expect(r.teeTimes[0].total).toBe(quote.total);
        // The service fee is real: all-in is more than the green fee.
        expect(quote.total).toBeGreaterThan(5000);
    });

    it('filters by time of day on the course\'s own clock', async () => {
        await published();
        const results = await searchCourses({ country, date: '2030-01-08', players: 1, from: '07:15', to: '07:30' }, NOW);
        expect(results[0].teeTimes.map(t => t.localTime)).toEqual(['07:20', '07:30']);
    });

    it("prices in the viewer's currency, the figure a hold in that currency would charge", async () => {
        const c = await published();
        const results = await searchCourses({ country, date: '2030-01-08', players: 2, currency: 'PHP' }, NOW);
        const r = results.find(x => x.course.id === c.id)!;
        const quote = await quoteGolf({ greenFeeTotal: 5000, currency: 'USD', chargeCurrency: 'PHP' });
        expect(r.from).toMatchObject({ total: quote.total, currency: 'PHP' });
        expect(r.teeTimes[0]).toMatchObject({ total: quote.total, currency: 'PHP' });
        expect(r.from!.perPlayer).toBe(Math.round((quote.total / 2) * 100) / 100);
    });

    it("prices the nearest dates in the viewer's currency too, in whole won", async () => {
        const c = await published({}, { daysOfWeek: [1] });
        const results = await searchCourses({ country, date: '2030-01-16', players: 2, currency: 'KRW' }, NOW);
        const r = results.find(x => x.course.id === c.id)!;
        expect(r.nearest.length).toBeGreaterThan(0);
        expect(r.nearest.every(n => n.currency === 'KRW' && Number.isInteger(n.total))).toBe(true);
    });

    it('falls back to USD for a course priced in a currency customers are not charged in', async () => {
        const c = await published({ currency: 'THB' }, { pricePerPlayer: 3000 });
        const results = await searchCourses({ country, date: '2030-01-08', players: 2 }, NOW);
        const r = results.find(x => x.course.id === c.id)!;
        const quote = await quoteGolf({ greenFeeTotal: 6000, currency: 'THB', chargeCurrency: 'USD' });
        expect(r.from).toMatchObject({ total: quote.total, currency: 'USD' });
    });

    it('needs enough spots for the party', async () => {
        await published({}, { spots: 2 });
        const results = await searchCourses({ country, date: '2030-01-08', players: 4 }, NOW);
        // The earlier courses of this run have 4 spots; the 2-spot course is not among the matches.
        expect(results.every(r => r.teeTimes.every(t => t.spotsLeft >= 4))).toBe(true);
        expect(results.map(r => r.course.slug)).not.toContain(`search-test-${run}-${created.length - 1}`);
    });

    it('offers the nearest dates when the chosen day has nothing', async () => {
        // Mondays only; 6 Jan 2030 is a Sunday, so the first bookable Monday is the 14th.
        const c = await published({}, { daysOfWeek: [1] });
        const results = await searchCourses({ country, date: '2030-01-16', players: 2 }, NOW);
        const r = results.find(x => x.course.id === c.id)!;
        expect(r.matches).toBe(false);
        expect(r.teeTimes).toEqual([]);
        expect(r.nearest.map(n => n.date)).toEqual(['2030-01-14', '2030-01-21']);
        // Matches sort ahead of misses.
        const firstMiss = results.findIndex(x => !x.matches);
        expect(results.slice(firstMiss).every(x => !x.matches)).toBe(true);
    });

    it('without a date, shows the cheapest upcoming price and no chips', async () => {
        const c = await published({}, { pricePerPlayer: 1800 });
        const results = await searchCourses({ country, players: 2 }, NOW);
        const r = results.find(x => x.course.id === c.id)!;
        expect(r.teeTimes).toEqual([]);
        expect(r.from?.total).toBe((await quoteGolf({ greenFeeTotal: 3600, currency: 'USD' })).total);
    });

    it('leaves out drafts and tee times beyond the course\'s window', async () => {
        const draft = await published({}, {}, false);
        const narrow = await published({ bookingWindowDays: 7 });
        const results = await searchCourses({ country, date: '2030-01-30', players: 2 }, NOW);
        const ids = results.map(r => r.course.id);
        expect(ids).not.toContain(draft.id);
        // Nothing within 7 days matches 30 January, and nothing else it has is on that date.
        const miss = results.find(r => r.course.id === narrow.id);
        expect(miss?.matches ?? false).toBe(false);
    });
});
