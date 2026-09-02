import { describe, expect, it } from 'vitest';
import { hotelItinerary, dateRange } from './itinerary';

/**
 * Postgres `date`/`timestamp` columns come back from postgres.js as `Date` objects, and
 * the admin list passes each row through as `any`, so the declared `string | null` on
 * these helpers was never enforced. The Date travelled all the way into JSX, where React
 * threw "Objects are not valid as a React child (found: [object Date])" and the admin
 * error boundary replaced the whole page — every hotel booking, every time one was opened.
 *
 * The list survived it because it renders `summary`, a string. Only the detail dialog
 * rendered `checkIn`/`checkOut` directly, which is why the table looked healthy.
 */
describe('hotelItinerary date handling', () => {
    it('returns strings when the driver hands back Date objects', () => {
        const it_ = hotelItinerary({
            property_name: 'Aria Hotel Jeju',
            room_name: 'Standard Double room with ocean view',
            check_in: new Date('2026-09-04T00:00:00.000Z'),
            check_out: new Date('2026-09-07T00:00:00.000Z'),
            guests_adults: 2,
            guests_children: 0,
        });

        expect(typeof it_.checkIn).toBe('string');
        expect(typeof it_.checkOut).toBe('string');
        // Anything React can render as a child. A Date fails this.
        expect(it_.checkIn).toContain('2026-09-04');
    });

    it('still passes strings through untouched', () => {
        const it_ = hotelItinerary({ check_in: '2026-09-04', check_out: '2026-09-07' });
        expect(it_.checkIn).toBe('2026-09-04');
        expect(it_.checkOut).toBe('2026-09-07');
    });

    it('drops an unparseable date rather than emitting Invalid Date', () => {
        const it_ = hotelItinerary({ check_in: new Date('nonsense') });
        expect(it_.checkIn).toBeUndefined();
    });

    it('leaves missing dates undefined', () => {
        const it_ = hotelItinerary({ property_name: 'Somewhere' });
        expect(it_.checkIn).toBeUndefined();
        expect(it_.checkOut).toBeUndefined();
        expect(it_.summary).toBe('Somewhere');
    });

    it('formats a range from Date objects, which is what the list column shows', () => {
        // en-GB short month, so "Sept" rather than "Sep" — matches what the list renders.
        expect(dateRange(new Date('2026-09-04T00:00:00Z'), new Date('2026-09-07T00:00:00Z')))
            .toBe('4 Sept – 7 Sept');
    });
});
