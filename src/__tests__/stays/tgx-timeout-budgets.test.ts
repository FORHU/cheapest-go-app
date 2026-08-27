/**
 * TGX timeout budgets must match OTV's stated limits: search 12 s, prebook 55 s,
 * book 180 s.
 *
 * The prebook Quote used to call getTgxSettings() with no arguments, silently
 * inheriting the 18,000 ms default — under a third of the budget OTV is entitled
 * to. A quote the supplier was still working on got aborted and the customer was
 * shown "this room is currently unavailable", blocking checkout on a booking that
 * would have succeeded. Nothing caught it because the value was a default, not a
 * literal, so it never appeared at the call site.
 *
 * These assertions pin the wire values so a change to the shared default cannot
 * quietly move a booking-critical timeout again.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/stays/travelgatex/client', async () => {
    const actual = await vi.importActual<typeof import('@/lib/server/stays/travelgatex/client')>(
        '@/lib/server/stays/travelgatex/client',
    );
    return { ...actual, tgxGraphQL: vi.fn() };
});

import { tgxGraphQL, getTgxSettings } from '@/lib/server/stays/travelgatex/client';
import { quoteTravelgateX } from '@/lib/server/travelgatex';

/** OTV's stated per-operation limits. */
const OTV = { search: 12_000, prebook: 55_000, book: 180_000 } as const;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.TRAVELGATEX_API_KEY ||= 'test-key';
});

describe('prebook Quote — OTV allows 55 s', () => {
    it('sends OTV the full 55 s supplier timeout, not the shared 18 s default', async () => {
        vi.mocked(tgxGraphQL).mockResolvedValue({
            data: { hotelX: { quote: { optionQuote: { optionRefId: 'T1', price: {} }, errors: [] } } },
        });

        await quoteTravelgateX({ token: 'T1' });

        const [, variables] = vi.mocked(tgxGraphQL).mock.calls[0];
        expect((variables as any).settings.timeout).toBe(OTV.prebook);
    });

    it('holds the HTTP connection open past the supplier timeout so TGX can return its own error', async () => {
        vi.mocked(tgxGraphQL).mockResolvedValue({
            data: { hotelX: { quote: { optionQuote: { optionRefId: 'T2', price: {} }, errors: [] } } },
        });

        await quoteTravelgateX({ token: 'T2' });

        const httpAbortMs = vi.mocked(tgxGraphQL).mock.calls[0][2] as number;
        expect(httpAbortMs).toBeGreaterThan(OTV.prebook);
        // Hanging up first turns a supplier-side error into an opaque client abort.
        expect(httpAbortMs).toBe(57_000);
    });

    it('never falls back to the shared default, whatever that default becomes', async () => {
        vi.mocked(tgxGraphQL).mockResolvedValue({
            data: { hotelX: { quote: { optionQuote: { optionRefId: 'T3', price: {} }, errors: [] } } },
        });

        await quoteTravelgateX({ token: 'T3' });

        const [, variables] = vi.mocked(tgxGraphQL).mock.calls[0];
        const sharedDefault = getTgxSettings().timeout;
        expect((variables as any).settings.timeout).not.toBe(sharedDefault);
    });
});

describe('search — OTV states 12 s', () => {
    it('sets no search call site above OTV\'s stated limit', async () => {
        const fs   = await import('node:fs/promises');
        const path = await import('node:path');
        const src  = await fs.readFile(
            path.resolve(process.cwd(), 'src/lib/server/stays/travelgatex/search.ts'),
            'utf8',
        );

        // Every explicit supplier timeout passed to getTgxSettings in the search module.
        const configured = [...src.matchAll(/getTgxSettings\(\s*_?cfg\s*,\s*([0-9_]+)/g)]
            .map(m => Number(m[1].replace(/_/g, '')));

        expect(configured.length).toBeGreaterThan(0);
        for (const ms of configured) {
            expect(ms).toBeLessThanOrEqual(OTV.search);
        }
    });

    it('leaves the HTTP abort above the supplier timeout on every search call', async () => {
        const fs   = await import('node:fs/promises');
        const path = await import('node:path');
        const src  = await fs.readFile(
            path.resolve(process.cwd(), 'src/lib/server/stays/travelgatex/search.ts'),
            'utf8',
        );

        // Aborting before the supplier timeout expires turns TGX's own error into an
        // opaque client abort, which is what made timeouts look like "no availability".
        const aborts = [...src.matchAll(/\}\s*,\s*(2[0-9]_?[0-9]{3}|1[3-9]_?[0-9]{3})\s*\)/g)]
            .map(m => Number(m[1].replace(/_/g, '')));

        expect(aborts.length).toBeGreaterThan(0);
        for (const ms of aborts) {
            expect(ms).toBeGreaterThan(OTV.search);
        }
    });
});

describe('the shared default is not a booking-safe value', () => {
    it('is well short of the prebook budget — which is why call sites must be explicit', () => {
        // Documents the trap rather than endorsing the number: any operation that
        // takes getTgxSettings() bare is running on a timeout nobody chose for it.
        expect(getTgxSettings().timeout).toBeLessThan(OTV.prebook);
    });
});
