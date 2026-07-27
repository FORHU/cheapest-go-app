import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { safeError } from '@/lib/server/safe-error';
import { prebookSchema } from '@/lib/schemas/booking';
import { quoteTravelgateX } from '@/lib/server/travelgatex';
import { rateLimit } from '@/lib/server/rate-limit';

export const maxDuration = 60;

/**
 * Convert TGX cancel policy → app-standard CancellationPolicy shape.
 *
 * TGX:  { refundable: bool, cancelPenalties: [{deadline, penaltyType, value, currency}] }
 * App:  { refundableTag: 'RFN'|'NRFN', cancelPolicyInfos: [{cancelTime, amount, type, currency}] }
 *
 * The component shows:
 *  - amount === 0  → "Cancel by [date] — Free Cancellation"
 *  - amount  >  0  → "Cancel after [date] — [amount] fee"
 * So for a refundable booking we prepend a free entry using the first deadline as the cutoff.
 */
function normalizeTgxCancelPolicy(tgxPolicy: any): object {
    if (!tgxPolicy) return {};

    const penalties: any[] = tgxPolicy.cancelPenalties || [];
    const refundable: boolean = tgxPolicy.refundable ?? false;
    const cancelPolicyInfos: object[] = [];

    if (refundable && penalties.length > 0) {
        // Free-cancellation window: "cancel by [first deadline] at no charge"
        cancelPolicyInfos.push({
            cancelTime: penalties[0].deadline,
            amount: 0,
            currency: penalties[0].currency || 'USD',
            type: 'AMOUNT',
        });
    }

    for (const p of penalties) {
        cancelPolicyInfos.push({
            cancelTime: p.deadline,
            // IMPORT = fixed fee, PERCENT = percentage of total, NIGHTS = nights × rate
            amount: p.value ?? 0,
            currency: p.currency || 'USD',
            type: p.penaltyType || 'AMOUNT',
        });
    }

    return {
        refundableTag: refundable ? 'RFN' : 'NRFN',
        cancelPolicyInfos,
    };
}

/**
 * Case-insensitive, punctuation-stripped room name comparison.
 * Returns true when at least 2 significant words overlap — handles variants like
 * "Deluxe King Room" vs "DELUXE KING ROOM (NON-REFUNDABLE)".
 */
function roomNamesMatch(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return false;
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    const stopWords = new Set(['room', 'type', 'bed', 'with', 'and', 'the', 'for']);
    const wordsA = na.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
    return wordsA.filter(w => wordsB.has(w)).length >= 2;
}

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
        const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'hotel-prebook' });
        if (!rl.success) {
            return Response.json({ success: false, error: 'Too many requests. Please wait a moment.' }, { status: 429 });
        }

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
            // In-process search (was an HTTP self-call to /api/fn/travelgatex-search).
            const freshResult = await runTgxSearch({
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

            // Build candidate list: preferred room first (matching user's original selection),
            // then other rooms as fallbacks. This ensures we quote the right room when possible
            // rather than always defaulting to the cheapest available room.
            const originalRoomName: string = parsed.data.roomName || '';
            const matchedRooms = originalRoomName
                ? freshRooms.filter(r => roomNamesMatch(r.roomName || r.roomType || '', originalRoomName))
                : [];
            const otherRooms = originalRoomName
                ? freshRooms.filter(r => !roomNamesMatch(r.roomName || r.roomType || '', originalRoomName))
                : freshRooms;
            const candidates = [...matchedRooms, ...otherRooms].slice(0, 5);

            if (candidates.length === 0) {
                return Response.json({ success: false, error: 'Room is no longer available for the selected dates' }, { status: 409 });
            }

            const firstCandidate = candidates[0];
            const firstOfferId: string = firstCandidate?.offerId || '';
            if (!firstOfferId.startsWith('TGX:')) {
                return Response.json({ success: false, error: 'Fresh search returned unexpected offer format' }, { status: 500 });
            }
            console.log('[prebook/tgx] originalRoomName:', originalRoomName || '(none)', '| matched:', matchedRooms.length, '| candidates:', candidates.map(r => r.roomName || r.roomType).join(', ').substring(0, 120));

            // OTV needs a moment to propagate the freshly-searched option into its
            // valuation cache. 3 s is more conservative than 1.5 s; avoids rate_not_found
            // on options that were genuinely just fetched.
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Try to quote each candidate until one succeeds.
            // OTV sometimes marks a specific rate as "not found" in valuation even though
            // it appeared in Search; trying subsequent rooms often yields a quotable option.
            let optionQuote: any = null;
            let quotedToken = firstOfferId.slice(4);
            let successfulRoom = firstCandidate;

            for (const room of candidates) {
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

            // Hard gate: only MERCHANT options can proceed to Stripe checkout.
            if (optionQuote.paymentType && optionQuote.paymentType !== 'MERCHANT') {
                console.error('[prebook/tgx] Non-MERCHANT paymentType from quote:', optionQuote.paymentType);
                return Response.json(
                    { success: false, error: 'This room is not available for online payment. Please contact support.' },
                    { status: 409 }
                );
            }

            // Quote succeeded — use confirmed price.
            // TGX docs: Book's optionRefId should be the identifier from the Quote step (optionQuote.optionRefId),
            // NOT the search token. Fall back to the quoted token if the field is absent.
            const bookToken = optionQuote.optionRefId || quotedToken;
            const bookedRoomName: string = successfulRoom?.roomName || successfulRoom?.roomType || '';
            const roomSubstituted = originalRoomName
                ? !roomNamesMatch(bookedRoomName, originalRoomName)
                : false;
            console.log('[prebook/tgx] Quote succeeded | quoted with:', quotedToken.substring(0, 40), '| book token:', bookToken.substring(0, 60), '| room:', bookedRoomName, '| substituted:', roomSubstituted, '| price:', optionQuote.price?.gross || optionQuote.price?.net, optionQuote.price?.currency);

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
                    surcharges: optionQuote.surcharges || [],
                    currency: optionQuote.price?.currency || currency,
                    cancellationPolicies: normalizeTgxCancelPolicy(optionQuote.cancelPolicy),
                    boardCode: optionQuote.boardCode || '',
                    rooms: optionQuote.rooms || [],
                    ...(roomSubstituted && bookedRoomName && {
                        roomSubstituted: true,
                        substitutedRoomName: bookedRoomName,
                    }),
                },
            });
        }

        return Response.json({ success: false, error: 'Only TravelgateX offers are supported' }, { status: 400 });
    } catch (err) {
        return Response.json(
            { success: false, error: safeError(err, 'prebook') },
            { status: 500 }
        );
    }
}
