import { resolveTgxDestinationCode } from '@/lib/server/search';
import { rateLimit } from '@/lib/server/rate-limit';
import { z } from 'zod';

/**
 * Resolve a city to its TravelgateX destination code.
 *
 * A miss reaches TravelgateX, so this costs a supplier call per unseen city name — worth a
 * limit of its own, which it never had while `/api/autocomplete` beside it allowed 60 a
 * minute (QA BG-10). The search bar no longer calls this on selection; the search resolves
 * its own code. Kept for callers that have a city and want the code without searching.
 */
const schema = z.object({
    cityName: z.string().min(1).max(100),
    countryCode: z.string().length(2).toUpperCase().optional(),
});

export async function POST(req: Request) {
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'autocomplete-resolve' });
    if (!rl.success) {
        return Response.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    try {
        const body = await req.json();
        const parsed = schema.safeParse(body);
        if (!parsed.success) return Response.json({ success: false }, { status: 400 });

        const code = await resolveTgxDestinationCode(parsed.data.cityName, parsed.data.countryCode);
        return Response.json({ success: true, code: code ?? null });
    } catch {
        return Response.json({ success: true, code: null });
    }
}
