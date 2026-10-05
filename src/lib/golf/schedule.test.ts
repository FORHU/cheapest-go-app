import { describe, it, expect } from 'vitest';
import { expandSchedule } from './schedule';

const iso = (dates: Date[]) => dates.map(d => d.toISOString());

describe('expandSchedule', () => {
    it('produces each tee time from first to last on the scheduled days only', () => {
        // Saturday 10 Oct 2026 → Sat, Sun skipped, Mon 12 Oct kept.
        const weekdays = { daysOfWeek: [1, 2, 3, 4, 5], firstTee: '06:00', lastTee: '06:30', intervalMinutes: 10 };
        expect(iso(expandSchedule(weekdays, 'Asia/Manila', '2026-10-10', 3))).toEqual([
            '2026-10-11T22:00:00.000Z', '2026-10-11T22:10:00.000Z',
            '2026-10-11T22:20:00.000Z', '2026-10-11T22:30:00.000Z',
        ]);
    });

    it('stops at the last tee even when the interval does not land on it', () => {
        const odd = { daysOfWeek: [1], firstTee: '06:00', lastTee: '06:25', intervalMinutes: 10 };
        expect(expandSchedule(odd, 'Asia/Manila', '2026-10-12', 1)).toHaveLength(3);
    });

    it('keeps the local time across a daylight-saving change', () => {
        const daily = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '07:00', lastTee: '07:00', intervalMinutes: 10 };
        expect(iso(expandSchedule(daily, 'America/New_York', '2026-03-07', 3))).toEqual([
            '2026-03-07T12:00:00.000Z', '2026-03-08T11:00:00.000Z', '2026-03-09T11:00:00.000Z',
        ]);
    });

    it('accepts times as Postgres prints them', () => {
        const pg = { daysOfWeek: [1], firstTee: '06:00:00', lastTee: '06:00:00', intervalMinutes: 10 };
        expect(expandSchedule(pg, 'Asia/Manila', '2026-10-12', 1)).toHaveLength(1);
    });
});
