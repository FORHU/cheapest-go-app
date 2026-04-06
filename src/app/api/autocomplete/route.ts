import { autocompleteDestinations } from '@/lib/server/search';
import { rateLimit } from '@/lib/server/rate-limit';
import { safeError } from '@/lib/server/safe-error';
import { z } from 'zod';

const autocompleteSchema = z.object({
    query: z.string().max(100),
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const rl = rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'autocomplete' });
    if (!rl.success) {
        return Response.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    try {
        const body = await req.json();
        const parsed = autocompleteSchema.safeParse(body);
        const query = parsed.success ? parsed.data.query : '';

        const data = await autocompleteDestinations(query);
        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: safeError(err, 'autocomplete') },
            { status: 500 }
        );
    }
}
