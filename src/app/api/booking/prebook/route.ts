import { prebookRoom } from '@/lib/server/bookings';
import { quoteTravelgateX } from '@/lib/server/travelgatex';
import { safeError } from '@/lib/server/safe-error';
import { prebookSchema } from '@/lib/schemas/booking';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = prebookSchema.safeParse(body);
        if (!parsed.success) {
            return Response.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
                { status: 400 }
            );
        }

        // TravelgateX path: offerId is encoded as "TGX:{searchToken}"
        if (parsed.data.offerId.startsWith('TGX:')) {
            const searchToken = parsed.data.offerId.slice(4);
            const quoteResult = await quoteTravelgateX({ token: searchToken });

            const optionQuote = quoteResult?.data;
            if (!optionQuote?.token) {
                return Response.json(
                    { success: false, error: 'TravelgateX quote failed — no token returned' },
                    { status: 400 }
                );
            }

            return Response.json({
                success: true,
                data: {
                    // Store quote token as prebookId with TGX prefix for the confirm step
                    prebookId: `TGX:${optionQuote.token}`,
                    provider: 'travelgatex',
                    price: {
                        subtotal: optionQuote.price?.net || 0,
                        taxes: (optionQuote.price?.gross || 0) - (optionQuote.price?.net || 0),
                        total: optionQuote.price?.gross || optionQuote.price?.net || 0,
                    },
                    currency: optionQuote.price?.currency || 'USD',
                    cancellationPolicies: optionQuote.cancelPolicy,
                    boardCode: optionQuote.boardCode,
                    rooms: optionQuote.rooms,
                },
            });
        }

        // LiteAPI path
        const data = await prebookRoom(parsed.data as any);
        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: safeError(err, 'prebook') },
            { status: 500 }
        );
    }
}
