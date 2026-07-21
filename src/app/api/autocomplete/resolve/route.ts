import { resolveTgxDestinationCode } from '@/lib/server/search';
import { z } from 'zod';

const schema = z.object({
    cityName: z.string().min(1).max(100),
    countryCode: z.string().length(2).toUpperCase().optional(),
});

export async function POST(req: Request) {
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
