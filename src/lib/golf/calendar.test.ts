import { describe, it, expect } from 'vitest';
import { clampDate, isSelectable, monthGrid, monthOf, shiftMonth, shiftMonthKeepingDay } from './calendar';

describe('monthGrid', () => {
    it('covers October 2026 in five Sunday-first weeks, padded from the neighbouring months', () => {
        const grid = monthGrid('2026-10', 0);
        expect(grid).toHaveLength(35);
        expect(grid[0]).toEqual({ date: '2026-09-27', inMonth: false });
        expect(grid[4]).toEqual({ date: '2026-10-01', inMonth: true });
        expect(grid[34]).toEqual({ date: '2026-10-31', inMonth: true });
    });

    it('starts on Monday when asked to', () => {
        const grid = monthGrid('2026-10', 1);
        expect(grid[0]).toEqual({ date: '2026-09-28', inMonth: false });
        expect(grid[3]).toEqual({ date: '2026-10-01', inMonth: true });
    });

    it('needs six weeks when the month starts late and is long', () => {
        // 1 March 2026 is a Sunday; with a Monday start it sits in the last column.
        expect(monthGrid('2026-03', 1)).toHaveLength(42);
    });

    it('needs only four weeks for a 28-day February starting on the first column', () => {
        // 1 February 2026 is a Sunday.
        const grid = monthGrid('2026-02', 0);
        expect(grid).toHaveLength(28);
        expect(grid.every(d => d.inMonth)).toBe(true);
    });
});

describe('shifting months', () => {
    it('crosses year ends', () => {
        expect(shiftMonth('2026-12', 1)).toBe('2027-01');
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
        expect(shiftMonth('2026-10', 14)).toBe('2027-12');
    });

    it('keeps the day, clamped to the shorter month', () => {
        expect(shiftMonthKeepingDay('2026-01-31', 1)).toBe('2026-02-28');
        expect(shiftMonthKeepingDay('2026-10-15', -1)).toBe('2026-09-15');
        expect(monthOf('2026-10-15')).toBe('2026-10');
    });
});

describe('bounds', () => {
    it('treats both ends as inclusive', () => {
        expect(isSelectable('2026-10-12', '2026-10-12', '2026-12-11')).toBe(true);
        expect(isSelectable('2026-12-11', '2026-10-12', '2026-12-11')).toBe(true);
        expect(isSelectable('2026-10-11', '2026-10-12', '2026-12-11')).toBe(false);
        expect(isSelectable('2026-12-12', '2026-10-12', '2026-12-11')).toBe(false);
        expect(isSelectable('2030-01-01')).toBe(true);
    });

    it('clamps into the range', () => {
        expect(clampDate('2026-09-01', '2026-10-12', '2026-12-11')).toBe('2026-10-12');
        expect(clampDate('2027-01-01', '2026-10-12', '2026-12-11')).toBe('2026-12-11');
        expect(clampDate('2026-11-01', '2026-10-12', '2026-12-11')).toBe('2026-11-01');
    });
});
