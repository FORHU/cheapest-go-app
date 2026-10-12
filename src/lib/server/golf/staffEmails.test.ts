import { describe, it, expect } from 'vitest';
import { buildInvitationEmail, buildNewRequestEmail, buildRequestDecisionEmail } from './staffEmails';

describe('buildInvitationEmail', () => {
    const now = new Date('2026-10-12T00:00:00Z');

    it('names the course, carries the link and says how long it lasts', () => {
        const { subject, html } = buildInvitationEmail({
            courseName: 'Wack Wack East', link: 'https://cheapestgo.com/course/join?token=abc', expiresAt: new Date('2026-10-19T00:00:00Z'), now,
        });
        expect(subject).toContain('Wack Wack East');
        expect(html).toContain('href="https://cheapestgo.com/course/join?token=abc"');
        expect(html).toContain('expires in 7 days');
    });

    it('escapes a course name that carries markup', () => {
        const { html } = buildInvitationEmail({
            courseName: '<script>alert(1)</script>', link: 'https://x.test/?a=1&b=2', expiresAt: new Date('2026-10-13T00:00:00Z'), now,
        });
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('a=1&amp;b=2');
        expect(html).toContain('expires in 1 day.');
    });
});

describe('buildRequestDecisionEmail', () => {
    it('welcomes an approval and points at the portal', () => {
        const { subject, html } = buildRequestDecisionEmail({ approved: true, courseName: 'Mission Hills', note: 'Welcome aboard.' });
        expect(subject).toContain('Mission Hills');
        expect(html).toContain('Welcome aboard.');
        expect(html).toContain('/course"');
    });

    it('explains a rejection with the admin\'s note and no sign-in link', () => {
        const { html } = buildRequestDecisionEmail({ approved: false, courseName: 'Mission Hills', note: 'We could not verify you represent the club.' });
        expect(html).toContain('We could not verify you represent the club.');
        expect(html).not.toContain('Open the course portal');
    });
});

describe('buildNewRequestEmail', () => {
    const booking = {
        courseName: 'Wack Wack East', startsAt: '2026-10-20T00:00:00.000Z', timezone: 'Asia/Manila',
        players: 2, leadName: 'Ana Cruz', decideBy: '2026-10-14T00:00:00.000Z',
    };

    it('says who wants to play, when, and by when it needs an answer', () => {
        const { subject, html } = buildNewRequestEmail(booking, 'https://cheapestgo.com/course');
        expect(subject).toContain('Wack Wack East');
        expect(html).toContain('Ana Cruz would like to play with 2 players');
        expect(html).toContain('Tue, 20 Oct 2026, 08:00');
        expect(html).toContain('Please confirm or decline by');
        expect(html).toContain('href="https://cheapestgo.com/course"');
    });

    it('carries no contact details or prices: the course answers in the portal', () => {
        const { html } = buildNewRequestEmail(booking, 'https://cheapestgo.com/course');
        expect(html).not.toMatch(/@|\$|USD/);
    });
});
