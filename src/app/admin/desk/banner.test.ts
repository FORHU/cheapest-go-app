import { describe, it, expect } from 'vitest';
import { deskBanner } from './banner';

/**
 * The banner over each desk page.
 *
 * The admin's banner is keyed on the last path segment, which is why the desk needs its
 * own: `/admin/desk/settings` ends in "settings" and would inherit "Configure
 * platform-wide preferences and security" — a promise the desk cannot keep, on the one
 * screen where an Agent can change something real.
 */

describe('deskBanner', () => {
    it('names the inbox', () => {
        expect(deskBanner('/admin/desk').title).toBe('Support Desk');
    });

    it('names the hours, not the platform settings', () => {
        const banner = deskBanner('/admin/desk/settings');

        expect(banner.title).toBe('Support Hours');
        expect(banner.subtitle).not.toMatch(/platform-wide/i);
    });

    it('falls back to the desk for anything else under it', () => {
        expect(deskBanner('/admin/desk/something-later').title).toBe('Support Desk');
    });

    it('always has an image, because the banner is the design', () => {
        for (const path of ['/admin/desk', '/admin/desk/settings']) {
            expect(deskBanner(path).image, path).toMatch(/^https:\/\//);
        }
    });
});
