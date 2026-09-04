import { runTgxSearch } from '@/lib/server/stays/travelgatex/search';
import { safeError } from '@/lib/server/safe-error';
import { prebookSchema } from '@/lib/schemas/booking';
import { quoteTravelgateX } from '@/lib/server/travelgatex';
import { rateLimit } from '@/lib/server/rate-limit';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { createAdminClient } from '@/utils/postgres/admin';
import { PREBOOK_QUOTE_TTL_MS } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';

// Worst case is the fresh hotel search (13 s HTTP abort) + OTV's 1.5 s valuation
// settle + a Quote that runs OTV's full stated 55 s budget (57 s abort) ≈ 72 s.
// 60 understated that from the moment the Quote timeout was corrected upward.
// Inert on EC2 — the app runs as a persistent Node process, not a serverless
// function — but it must not claim a ceiling the route can legitimately exceed.
export const maxDuration = 90;

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
    const separator = token.includes('!~|') ? '!~|' : '[';
    for (const seg of token.split(separator)) {
        if (seg.length > 1) segs[seg[0]] = seg.slice(1);
    }
    const parseYYMMDD = (v: string | undefined): string | null => {
        if (!v || v.length !== 6) return null;
        return `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
    };
    return {
        hotelCode:   segs['d'] || null,
        checkIn:     parseYYMMDD(segs['b']),
        checkOut:    parseYYMMDD(segs['c']),
        nationality: segs['h'] || 'US',
    };
}

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        // Prebook is browsable signed out (ADR-0027), so there is often no user to key
        // on — but when there is one, prefer it: it survives shared addresses and NAT.
        const { user } = await getAuthenticatedUser();
        const rl = await rateLimit(req, {
            limit: 30,
            windowMs: 60_000,
            prefix: 'hotel-prebook',
            ...(user ? { userId: user.id } : {}),
        });
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
            const { hotelCode, checkIn, checkOut, nationality } = parseTgxOptionToken(staleOptionRefId);

            if (!hotelCode || !checkIn || !checkOut) {
                console.error('[prebook/tgx] Could not parse hotel code or dates from token:', staleOptionRefId.substring(0, 80));
                return Response.json({ success: false, error: 'Invalid TGX offer ID — could not decode hotel details' }, { status: 400 });
            }

            console.log(`[prebook/tgx] Fresh search: hotel=${hotelCode} ${checkIn}→${checkOut} adults=${adults} nationality=${nationality}`);
            // bypassCache=true: skip the DB cache so we always get live OTV tokens.
            // Cached tokens from a prior search expire quickly and fail TGX valuation.
            const freshResult = await runTgxSearch({
                hotelCode,
                checkin:  checkIn,
                checkout: checkOut,
                adults,
                children,
                currency,
                guest_nationality: nationality,
                bypassCache: true,
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
            // valuation cache before Quote will succeed. 1.5 s is usually enough;
            // the parallel quoting below adds resilience against transient misses.
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Build a flat list of all (room, token) pairs to try, preferred room first.
            // We quote ALL of them in parallel via Promise.any so the first winner resolves
            // immediately — worst case is one quote RTT (~3-5 s) instead of N × RTT serially.
            type QuoteWinner = { quote: any; token: string; room: any };
            const quoteAttempts: Promise<QuoteWinner>[] = [];

            for (const room of candidates) {
                const rOfferId: string = room?.offerId || '';
                if (!rOfferId.startsWith('TGX:')) continue;
                const rOptionId = rOfferId.slice(4);
                const rTgxId: string       = room?.rates?.[0]?._tgx?.id    || '';
                const rNativeToken: string = room?.rates?.[0]?._tgx?.token || '';
                const tokensToTry = [...new Set([rOptionId, rTgxId, rNativeToken].filter(Boolean))];

                for (const tok of tokensToTry) {
                    quoteAttempts.push(
                        quoteTravelgateX({ token: tok })
                            .then((res) => {
                                if (!res?.data) throw new Error('empty quote response');
                                console.log('[prebook/tgx] Quote succeeded | token:', tok.substring(0, 60), '| room:', room?.roomName || room?.roomType);
                                return { quote: res.data, token: tok, room };
                            })
                            .catch((err) => {
                                console.warn('[prebook/tgx] Quote failed | token:', tok.substring(0, 40), ':', err?.message?.substring(0, 80));
                                throw err;
                            })
                    );
                }
            }

            if (quoteAttempts.length === 0) {
                return Response.json(
                    { success: false, error: 'This room is currently unavailable for booking. Please try a different hotel or check back later.' },
                    { status: 409 }
                );
            }

            let winner: QuoteWinner | null = null;
            try {
                winner = await Promise.any(quoteAttempts);
            } catch {
                // AggregateError — every parallel attempt rejected
            }

            if (!winner) {
                console.warn('[prebook/tgx] All parallel Quote attempts failed — blocking checkout');
                return Response.json(
                    { success: false, error: 'This room is currently unavailable for booking. Please try a different hotel or check back later.' },
                    { status: 409 }
                );
            }

            const { quote: optionQuote, token: quotedToken, room: successfulRoom } = winner;

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
            const prebookId = `TGX:${bookToken}`;
            const bookedRoomName: string = successfulRoom?.roomName || successfulRoom?.roomType || '';
            const roomSubstituted = originalRoomName
                ? !roomNamesMatch(bookedRoomName, originalRoomName)
                : false;
            console.log('[prebook/tgx] Quote succeeded | quoted with:', quotedToken.substring(0, 40), '| book token:', bookToken.substring(0, 60), '| room:', bookedRoomName, '| substituted:', roomSubstituted, '| price:', optionQuote.price?.gross || optionQuote.price?.net, optionQuote.price?.currency);

            // ── Persist the supplier-quoted price ──
            //
            // create-payment charges from this row, not from the client's payload, so
            // the Stripe base and the FX conversion both come from TGX rather than the
            // browser. Failing to record it must not fail the prebook: create-payment
            // rejects an unknown prebookId, so the worst case is a retry.
            const quotedNet = optionQuote.price?.net || 0;
            const quotedGross = optionQuote.price?.gross || optionQuote.price?.net || 0;
            const quotedCurrency = optionQuote.price?.currency || currency;

            try {
                const db = createAdminClient();
                await db.from('hotel_prebook_quotes').upsert({
                    prebook_id: prebookId,
                    net: quotedNet,
                    gross: quotedGross,
                    currency: quotedCurrency.toUpperCase(),
                    room_name: bookedRoomName || null,
                    check_in: checkIn,
                    check_out: checkOut,
                    expires_at: new Date(Date.now() + PREBOOK_QUOTE_TTL_MS).toISOString(),
                }, { onConflict: 'prebook_id' });
            } catch (persistErr) {
                console.error('[prebook/tgx] Failed to persist quote — checkout will reject this prebookId:', persistErr);
            }

            // ── Server-side display conversion ──
            //
            // The browser renders prices, it does not compute them (CONTEXT.md → Display
            // Currency). Converting here means the figure the customer sees is produced by
            // the same code and the same rates that create-payment will charge from, so the
            // two cannot drift into a price-changed prompt.
            //
            // The supplier's own price stays authoritative and is what gets persisted — this
            // block is presentation only.
            const quotedSubtotal = optionQuote.price?.net || 0;
            const quotedTaxes = (optionQuote.price?.gross || 0) - (optionQuote.price?.net || 0);
            const quotedTotal = optionQuote.price?.gross || optionQuote.price?.net || 0;
            const displayCurrency = currency.toUpperCase();

            let display: object | null = null;
            if (quotedCurrency.toUpperCase() === displayCurrency) {
                display = {
                    currency: displayCurrency,
                    subtotal: quotedSubtotal,
                    taxes: quotedTaxes,
                    total: quotedTotal,
                    converted: false,
                };
            } else {
                try {
                    await refreshExchangeRates();
                    const to = (n: number) =>
                        Math.round(convertCurrencyStrict(n, quotedCurrency, displayCurrency) * 100) / 100;
                    display = {
                        currency: displayCurrency,
                        subtotal: to(quotedSubtotal),
                        taxes: to(quotedTaxes),
                        total: to(quotedTotal),
                        converted: true,
                    };
                } catch (fxErr: any) {
                    // Leave display absent; the client falls back to showing supplier currency.
                    console.warn('[prebook/tgx] display conversion unavailable:', fxErr?.message);
                }
            }

            // Quote is most authoritative; fall back to fresh-search result when
            // the Quote response omits cancelPenalties (common for cheap OTV rates).
            const effectiveCancelPolicy =
                optionQuote.cancelPolicy?.cancelPenalties?.length
                    ? optionQuote.cancelPolicy
                    : (successfulRoom?.cancelPolicy?.cancelPenalties?.length
                        ? successfulRoom.cancelPolicy
                        : optionQuote.cancelPolicy);

            return Response.json({
                success: true,
                data: {
                    prebookId,
                    provider: 'travelgatex',
                    price: {
                        subtotal: quotedSubtotal,
                        taxes: quotedTaxes,
                        total: quotedTotal,
                    },
                    surcharges: optionQuote.surcharges || [],
                    currency: optionQuote.price?.currency || currency,
                    ...(display ? { display } : {}),
                    cancellationPolicies: normalizeTgxCancelPolicy(effectiveCancelPolicy),
                    boardCode: optionQuote.boardCode || '',
                    rooms: optionQuote.rooms || [],
                    ...(roomSubstituted && bookedRoomName && {
                        roomSubstituted: true,
                        substitutedRoomName: bookedRoomName,
                    }),
                },
            });
        }

        return Response.json({ success: false, error: 'This hotel is not available for instant online booking. Please try a different hotel.' }, { status: 400 });
    } catch (err) {
        return Response.json(
            { success: false, error: safeError(err, 'prebook') },
            { status: 500 }
        );
    }
}
