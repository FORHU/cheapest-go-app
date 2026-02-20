import { autocompleteDestinations } from '@/lib/server/search';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { query } = body;

        const data = await autocompleteDestinations(query);
        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
