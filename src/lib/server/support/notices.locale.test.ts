import { describe, it, expect } from 'vitest';
import { SUPPORT_NOTICE, type SupportNoticeCode } from './responder';
import en from '@/locales/en.json';
import ja from '@/locales/ja.json';
import ko from '@/locales/ko.json';
import zh from '@/locales/zh.json';

/**
 * The responder writes a notice as a code and each reader renders it from their own
 * locale file. That only works while the two agree.
 *
 * Nothing in the type system connects a `SupportNoticeCode` to a key in a JSON file, so
 * the failure mode is silent and one-sided: add a notice, ship it, and a Korean customer
 * on GeomeeGo — a brand locked to Korean — sees a missing-translation key or English
 * where a sentence should be. This is the check that stops that reaching them.
 */

const locales: Record<string, unknown> = { en, ja, ko, zh };

function noticesIn(locale: unknown): Record<string, unknown> {
    const support = (locale as { support?: { notice?: Record<string, unknown> } }).support;
    return support?.notice ?? {};
}

const codes = Object.keys(SUPPORT_NOTICE) as SupportNoticeCode[];

describe('support notice translations', () => {
    it.each(Object.keys(locales))('%s translates every notice the responder can write', name => {
        const notice = noticesIn(locales[name]);

        for (const code of codes) {
            const value = notice[code];
            expect(typeof value, `${name}.support.notice.${code} is missing`).toBe('string');
            expect((value as string).trim().length, `${name}.support.notice.${code} is empty`)
                .toBeGreaterThan(0);
        }
    });

    it.each(Object.keys(locales))('%s carries no notice the responder cannot write', name => {
        // A key left behind after a notice is renamed or dropped. Harmless to render, but
        // it is the thing that makes a translator think a string is still in use.
        expect(Object.keys(noticesIn(locales[name])).sort()).toEqual([...codes].sort());
    });
});
