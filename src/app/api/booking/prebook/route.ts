import { prebookRoom } from '@/lib/server/bookings';
import { invokeEdgeFunction } from '@/utils/supabase/functions';
import { safeError } from '@/lib/server/safe-error';
import { prebookSchema } from '@/lib/schemas/booking';
import { quoteTravelgateX } from '@/lib/server/travelgatex';

/**
 * TGX option tokens encode hotel code and dates in segments separated by "!~|".
 * Segment keys: b=checkin(YYMMDD), c=checkout(YYMMDD), d=hotelCode(numeric ETG ID)
 */
function parseTgxOptionToken(token: string) {
    const segs: Record<string, string> = {};
    for (const seg of token.split('!~|')) {
        if (seg.length > 1) segs[seg[0]] = seg.slice(1);
    }
    const parseYYMMDD = (v: string | undefined): string | null => {
        if (!v || v.length !== 6) return null;
        return `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
    };
    return {
        hotelCode: segs['d'] || null,
        checkIn:   parseYYMMDD(segs['b']),
        checkOut:  parseYYMMDD(segs['c']),
    };
}

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

        // TravelgateX path: offerId is encoded as "TGX:{optionRefId}"
        if (parsed.data.offerId.startsWith('TGX:')) {
            const staleOptionRefId = parsed.data.offerId.slice(4);
            const adults   = parsed.data.adults   ?? 2;
            const children = parsed.data.children ?? 0;
            const currency = parsed.data.currency || 'USD';

            // TGX option tokens expire quickly. Decode the hotel code and dates from
            // the stale token, then re-search that hotel to get a fresh optionRefId.
            const { hotelCode, checkIn, checkOut } = parseTgxOptionToken(staleOptionRefId);

            if (!hotelCode || !checkIn || !checkOut) {
                console.error('[prebook/tgx] Could not parse hotel code or dates from token:', staleOptionRefId.substring(0, 80));
                return Response.json({ success: false, error: 'Invalid TGX offer ID — could not decode hotel details' }, { status: 400 });
            }

            console.log(`[prebook/tgx] Fresh search: hotel=${hotelCode} ${checkIn}→${checkOut} adults=${adults}`);
            const freshResult = await invokeEdgeFunction('travelgatex-search', {
                hotelCode,
                checkin:  checkIn,
                checkout: checkOut,
                adults,
                children,
                currency,
                guest_nationality: 'KR',
            });

            const freshRooms: any[] = freshResult?.data?.roomTypes || [];
            if (!freshRooms.length) {
                return Response.json({ success: false, error: 'Room is no longer available for the selected dates' }, { status: 409 });
            }

            // Use the cheapest available room's fresh optionRefId
            const freshRoom = freshRooms[0];
            const freshOfferId: string = freshRoom?.offerId || '';
            if (!freshOfferId.startsWith('TGX:')) {
                return Response.json({ success: false, error: 'Fresh search returned unexpected offer format' }, { status: 500 });
            }
            // opt.id — used as prebookId (parseable for hotel code/dates in retry path)
            const freshOptionRefId = freshOfferId.slice(4);
            // opt.token — OTV's native quote token; prefer it over opt.id for Quote/Book.
            // Fallback to opt.id if token is not present (older search response).
            const rawOptToken: string | undefined = freshRoom?.rates?.[0]?._tgx?.token;
            const freshQuoteToken: string = rawOptToken || freshOptionRefId;
            console.log('[prebook/tgx] opt.id:', freshOptionRefId.substring(0, 60), '| opt.token:', (rawOptToken || 'NONE').substring(0, 60), '| same:', freshQuoteToken === freshOptionRefId);

            // OTV needs a moment to propagate the freshly-searched option into its
            // valuation cache. 3 s is more conservative than 1.5 s; avoids rate_not_found
            // on options that were genuinely just fetched.
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Try to quote each available room until one succeeds.
            // OTV sometimes marks a specific rate as "not found" in valuation even though
            // it appeared in Search; trying subsequent rooms often yields a quotable option.
            let optionQuote: any = null;
            let quotedToken = freshOptionRefId;
            let successfulRoom = freshRoom;

            for (const room of freshRooms.slice(0, 5)) {
                const rOfferId: string = room?.offerId || '';
                if (!rOfferId.startsWith('TGX:')) continue;
                const rOptionId = rOfferId.slice(4);
                const rNativeToken: string = room?.rates?.[0]?._tgx?.token || rOptionId;
                const tokensToTry = rNativeToken !== rOptionId
                    ? [rNativeToken, rOptionId]
                    : [rOptionId];

                for (const tok of tokensToTry) {
                    console.log('[prebook/tgx] Quoting with token:', tok.substring(0, 80));
                    try {
                        const quoteResult = await quoteTravelgateX({ token: tok });
                        optionQuote = quoteResult?.data;
                        quotedToken = tok;
                        successfulRoom = room;
                        break;
                    } catch (qErr: any) {
                        console.warn('[prebook/tgx] Quote failed for token', tok.substring(0, 40), ':', qErr.message?.substring(0, 100));
                    }
                }
                if (optionQuote) break;
            }

            if (!optionQuote) {
                // All rooms and tokens failed Quote — OTV Valuation is not returning any
                // available option for this hotel right now. Block checkout so the user is
                // not charged for a booking that will fail at the Book step.
                console.warn('[prebook/tgx] All Quote attempts failed for all rooms — blocking checkout');
                return Response.json(
                    { success: false, error: 'This room is currently unavailable for booking. Please try a different hotel or check back later.' },
                    { status: 409 }
                );
            }

            // Quote succeeded — use confirmed price.
            // TGX docs: Book's optionRefId should be the identifier from the Quote step (optionQuote.optionRefId),
            // NOT the search token. Fall back to the quoted token if the field is absent.
            const bookToken = optionQuote.optionRefId || quotedToken;
            console.log('[prebook/tgx] Quote succeeded | quoted with:', quotedToken.substring(0, 40), '| book token:', bookToken.substring(0, 60), '| room:', successfulRoom?.roomName, '| price:', optionQuote.price?.gross || optionQuote.price?.net, optionQuote.price?.currency);

            return Response.json({
                success: true,
                data: {
                    prebookId: `TGX:${bookToken}`,
                    provider: 'travelgatex',
                    price: {
                        subtotal: optionQuote.price?.net || 0,
                        taxes: (optionQuote.price?.gross || 0) - (optionQuote.price?.net || 0),
                        total: optionQuote.price?.gross || optionQuote.price?.net || 0,
                    },
                    currency: optionQuote.price?.currency || currency,
                    cancellationPolicies: optionQuote.cancelPolicy,
                    boardCode: optionQuote.boardCode || '',
                    rooms: optionQuote.rooms || [],
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
