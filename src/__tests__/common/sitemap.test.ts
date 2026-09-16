import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sitemap from '@/app/sitemap';

const APP_DIR = path.join(process.cwd(), 'src', 'app');
const LOCALE_PREFIX = /^\/(ko|ja|zh)(?=\/|$)/;

/** Strip the locale prefix — `/ko/about` and `/about` are the same route on disk. */
function toRoutePath(url: string): string {
    const pathname = new URL(url).pathname.replace(/\/$/, '') || '/';
    return pathname.replace(LOCALE_PREFIX, '') || '/';
}

/** Does a static `page.tsx` exist for this path, ignoring route groups like `(main)`? */
function hasStaticPage(routePath: string): boolean {
    const segments = routePath === '/' ? [] : routePath.slice(1).split('/');

    const walk = (dir: string, remaining: string[]): boolean => {
        if (remaining.length === 0) {
            const hasPage = ['page.tsx', 'page.ts', 'page.jsx', 'page.js']
                .some(f => fs.existsSync(path.join(dir, f)));
            if (hasPage) return true;
        } else {
            // Exact segment match — a dynamic `[slug]` directory deliberately does not count.
            const [head, ...tail] = remaining;
            const direct = path.join(dir, head);
            if (fs.existsSync(direct) && fs.statSync(direct).isDirectory() && walk(direct, tail)) {
                return true;
            }
        }

        // Route groups `(main)` and parallel routes `@modal` are invisible in the URL,
        // so the page may live one or more levels deeper without consuming a segment.
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory() && /^[(@]/.test(e.name))
            .some(e => walk(path.join(dir, e.name), remaining));
    };

    return walk(APP_DIR, segments);
}

describe('sitemap', () => {
    const entries = sitemap();

    it('is not empty', () => {
        expect(entries.length).toBeGreaterThan(0);
    });

    // The bug this guards: the sitemap once built `/destinations/<id>` URLs from a
    // constant while the route resolved slugs from a database table, publishing 80
    // URLs that all 404'd. Any sitemap URL whose route is dynamic or missing is
    // a URL we cannot prove serves a 200, so it does not belong here.
    it('every URL maps to a static page that exists on disk', () => {
        const orphans = entries
            .map(e => toRoutePath(e.url))
            .filter(routePath => !hasStaticPage(routePath));

        expect(orphans).toEqual([]);
    });

    it('emits every path for the default locale and ko/ja/zh', () => {
        const byRoute = new Map<string, number>();
        for (const e of entries) {
            const routePath = toRoutePath(e.url);
            byRoute.set(routePath, (byRoute.get(routePath) ?? 0) + 1);
        }
        for (const [routePath, count] of byRoute) {
            expect(count, `${routePath} should appear 4 times`).toBe(4);
        }
    });

    it('contains no duplicate URLs', () => {
        const urls = entries.map(e => e.url);
        expect(new Set(urls).size).toBe(urls.length);
    });
});
