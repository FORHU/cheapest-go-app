import { describe, it, expect } from 'vitest';
import { nearestDates, parseSearchParams, searchQuery } from './search';

describe('parseSearchParams', () => {
    it('defaults to two players and no filters', () => {
        expect(parseSearchParams({})).toEqual({ players: 2 });
    });

    it('keeps valid values', () => {
        expect(parseSearchParams({ date: '2026-10-20', players: '4', from: '07:00', to: '12:30', country: 'Japan' }))
            .toEqual({ country: 'Japan', date: '2026-10-20', players: 4, from: '07:00', to: '12:30' });
    });

    it('drops what does not parse instead of failing', () => {
        const p = parseSearchParams({ date: '2026-02-30', players: '9', from: '7am', to: '25:00' });
        expect(p).toEqual({ players: 2 });
    });

    it('ignores an inverted time window', () => {
        expect(parseSearchParams({ from: '14:00', to: '08:00' })).toEqual({ players: 2 });
    });

    it('takes the first of a repeated parameter', () => {
        expect(parseSearchParams({ players: ['3', '1'] }).players).toBe(3);
    });
});

describe('searchQuery', () => {
    it('omits defaults', () => {
        expect(searchQuery({ players: 2 })).toBe('');
        expect(searchQuery({ date: '2026-10-20', players: 3, from: '07:00' })).toBe('?date=2026-10-20&players=3&from=07%3A00');
    });
});

describe('nearestDates', () => {
    it('returns the closest earlier and later dates', () => {
        expect(nearestDates('2026-10-20', ['2026-10-10', '2026-10-18', '2026-10-22', '2026-10-30', '2026-10-18']))
            .toEqual(['2026-10-18', '2026-10-22']);
    });
    it('copes with only one side', () => {
        expect(nearestDates('2026-10-20', ['2026-10-25'])).toEqual(['2026-10-25']);
        expect(nearestDates('2026-10-20', [])).toEqual([]);
    });
    it('never offers the date itself', () => {
        expect(nearestDates('2026-10-20', ['2026-10-20'])).toEqual([]);
    });
});
