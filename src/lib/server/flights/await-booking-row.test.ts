import { describe, it, expect, vi } from 'vitest';
import { awaitBookingRow } from './await-booking-row';

/** Minimal stand-in for the supabase-style builder chain this helper uses. */
function dbReturning(sequence: Array<{ data?: any; throws?: boolean }>) {
    let call = 0;
    const db = {
        calls: () => call,
        from: () => db,
        select: () => db,
        eq: () => db,
        maybeSingle: async () => {
            const step = sequence[Math.min(call, sequence.length - 1)];
            call++;
            if (step.throws) throw new Error('connection reset');
            return { data: step.data ?? null };
        },
    };
    return db as any;
}

const noSleep = vi.fn(async () => {});

describe('awaitBookingRow', () => {
    it('returns immediately when the row is already there', async () => {
        const db = dbReturning([{ data: { id: 'bk-1', pnr: 'BEV5AE', status: 'ticketed' } }]);
        const row = await awaitBookingRow(db, 'sess-1', { sleep: noSleep });
        expect(row?.pnr).toBe('BEV5AE');
        expect(db.calls()).toBe(1);
    });

    it('waits out the path that is mid-insert', async () => {
        // The race this exists for: two callers, one holding the session lock.
        const db = dbReturning([
            { data: null },
            { data: null },
            { data: { id: 'bk-2', pnr: 'QRS123', status: 'ticketed' } },
        ]);
        const row = await awaitBookingRow(db, 'sess-2', { sleep: noSleep });
        expect(row?.pnr).toBe('QRS123');
        expect(db.calls()).toBe(3);
    });

    it('returns null only after every attempt is spent', async () => {
        const db = dbReturning([{ data: null }]);
        const row = await awaitBookingRow(db, 'sess-3', { attempts: 4, sleep: noSleep });
        expect(row).toBeNull();
        expect(db.calls()).toBe(4);
    });

    it('surfaces a row the other path recorded as failed', async () => {
        const db = dbReturning([{ data: { id: 'bk-4', pnr: null, status: 'failed' } }]);
        const row = await awaitBookingRow(db, 'sess-4', { sleep: noSleep });
        expect(row?.status).toBe('failed');
    });

    it('keeps polling through a transient lookup error', async () => {
        const db = dbReturning([
            { throws: true },
            { data: { id: 'bk-5', pnr: 'ZZZ999', status: 'ticketed' } },
        ]);
        const row = await awaitBookingRow(db, 'sess-5', { sleep: noSleep });
        expect(row?.pnr).toBe('ZZZ999');
    });

    it('does not sleep after the final attempt', async () => {
        const sleep = vi.fn(async () => {});
        await awaitBookingRow(dbReturning([{ data: null }]), 'sess-6', { attempts: 3, sleep });
        expect(sleep).toHaveBeenCalledTimes(2);
    });
});
