import { describe, it, expect } from 'vitest';
import en from './en.json';
import ja from './ja.json';
import ko from './ko.json';
import zh from './zh.json';

/**
 * The page that lists hotel, flight and golf bookings is called "Bookings", not "Trips": a tee time
 * is not a trip. This pins every string that names that page, in all four languages, so a new one
 * copied from an old template does not bring the word back.
 *
 * It deliberately covers only strings that name the page. "Trip" meaning a journey ("plan your
 * trip", "round trip", trip reminders) and the wishlist's "saved trips" are left alone.
 */

const PAGE_NAMING_KEYS = [
    'nav.trips',
    'nav.myTrips',
    'trips.myTrips',
    'trips.title',
    'trips.emptyState.allTitle',
    'trips.emptyState.upcomingTitle',
    'trips.emptyState.pastTitle',
    'trips.emptyState.otherDesc',
    'bookingDestination.myTrips',
    'bookingDestination.noBooking',
    'bookingDestination.goToTrips',
    'checkout.success.freeCancellationInfo',
    'checkout.success.viewMyTrips',
    'flightBook.success.viewMyTrips',
    'errors.trips.title',
    'appBanner.subtitle',
    'help.sections.confirmation.body',
    'help.sections.changes.body',
];

const OLD_WORDING: Record<string, RegExp> = {
    en: /\btrips?\b/i,
    ja: /マイトリップ|旅程|旅行/,
    ko: /여행/,
    zh: /行程|旅行/,
};

const get = (messages: unknown, path: string): string | undefined =>
    path.split('.').reduce<any>((node, part) => node?.[part], messages);

describe.each([['en', en], ['ja', ja], ['ko', ko], ['zh', zh]] as const)('%s', (locale, messages) => {
    it.each(PAGE_NAMING_KEYS)('%s no longer calls the bookings page "Trips"', key => {
        const value = get(messages, key);
        expect(typeof value).toBe('string');
        expect(value).not.toMatch(OLD_WORDING[locale]);
    });
});

describe('the wording that replaces it', () => {
    it('is "Bookings" in the places people look first', () => {
        expect(en.nav.trips).toBe('Bookings');
        expect(en.nav.myTrips).toBe('My bookings');
        expect(en.trips.myTrips).toBe('My Bookings');
        expect(en.trips.title).toBe('My Bookings | CheapestGo');
        expect(en.checkout.success.viewMyTrips).toBe('View My Bookings');
    });

    it('leaves a journey a journey', () => {
        expect(en.landing.search.tripType.roundTrip).toBe('Round trip');
        expect(en.account.communications.tripReminders).toBe('Trip Reminders');
        expect(en.trips.wishlist.emptyTitle).toBe('No saved trips yet');
    });
});
