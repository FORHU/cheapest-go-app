import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Every scheduled job must name a route that exists, and answer the method it is called with.
 *
 * `curl -sf` exits non-zero on a 404 or a 405 but prints nothing, and the sidecar discards the
 * output, so a schedule pointing at a route that was never built looks exactly like one that
 * runs fine. Three entries did: warm-hotel-cache, sync-hotel-deals and duffel-balance-check —
 * and the last of those was the only advance warning of the Duffel balance running dry, which
 * fails every flight booking at order creation.
 *
 * Read as source rather than exercised, because the schedule is a text file the application
 * never loads and nothing else would ever notice a typo in it.
 */

const CRONTAB = path.join(process.cwd(), 'docker/cron/crontab');

interface Entry { line: string; method: string; route: string }

function scheduled(): Entry[] {
    return fs.readFileSync(CRONTAB, 'utf8')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .map((line) => {
            // The path as called, with any query string and surrounding quotes dropped.
            const url = line.match(/\$APP_URL(\/[^\s"'?]+)/);
            const verb = line.match(/-X\s+(GET|POST|PUT|PATCH|DELETE)/);
            return { line, method: verb?.[1] ?? 'GET', route: url?.[1] ?? '' };
        });
}

describe('the cron sidecar schedule', () => {
    const entries = scheduled();

    it('has entries to check', () => {
        expect(entries.length).toBeGreaterThan(10);
    });

    it('calls only URLs under $APP_URL', () => {
        expect(entries.filter(e => !e.route).map(e => e.line)).toEqual([]);
    });

    it.each(entries.map(e => [`${e.method} ${e.route}`, e] as const))(
        '%s is a route that exists and answers that method',
        (_name, entry) => {
            const file = path.join(process.cwd(), 'src/app', entry.route, 'route.ts');
            expect(fs.existsSync(file), `no route file for ${entry.route}`).toBe(true);

            const src = fs.readFileSync(file, 'utf8');
            const exported = new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${entry.method}\\b`);
            expect(exported.test(src), `${entry.route} does not export ${entry.method}`).toBe(true);
        },
    );
});
