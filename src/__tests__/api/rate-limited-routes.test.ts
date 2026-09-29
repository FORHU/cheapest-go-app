import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Every route that can reach a paid supplier needs a limit of its own.
 *
 * `/api/autocomplete/resolve` had none while `/api/autocomplete` beside it allowed 60 a
 * minute, and a miss there costs a TravelgateX lookup per unseen city name (QA BG-10).
 * Read as source, because the limit is a line in the route rather than behaviour a unit
 * test can observe without a database.
 */

const ROUTES = [
    'src/app/api/autocomplete/route.ts',
    'src/app/api/autocomplete/resolve/route.ts',
    'src/app/api/search/stream/route.ts',
    'src/app/api/flights/search/route.ts',
    'src/app/api/booking/prebook/route.ts',
    'src/app/api/poi-photo/route.ts',
];

describe('supplier-facing routes are rate limited', () => {
    it.each(ROUTES)('%s calls rateLimit', (file) => {
        const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
        expect(source).toMatch(/rateLimit\(/);
        expect(source).toMatch(/429/);
    });
});
