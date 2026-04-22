/**
 * Mystifly Reissue — Supabase Edge Function
 *
 * POST /api/PostTicketingRequest (ptrType: "ReissueQuote") — 2-step flow:
 *   step=quote   AcceptQuote:"None"   → returns PTRId + exchange quote (fare diff)
 *   step=execute AcceptQuote:"Accept" → executes the reissue
 *
 * Request body:
 *   { step:"quote",   mfRef, passengers, originDestinations }
 *   { step:"execute", mfRef, passengers, ptrId, originDestinations, bookingId? }
 */
import { getCorsHeaders } from '../_shared/cors.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { reissueQuote, executeReissue, MystiflyError, type ReissueOriginDestination } from '../_shared/mystiflyClient.ts';

declare const Deno: any;

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const startMs = Date.now();

    try {
        const body = JSON.parse(await req.text());
        const { step } = body;

        if (!step || !['quote', 'execute'].includes(step)) {
            return jsonResponse(corsHeaders, { success: false, error: 'step must be "quote" or "execute"' }, 400);
        }

        // ── Step 1: ReissueQuote (AcceptQuote: "None") ───────────────
        if (step === 'quote') {
            const { mfRef, passengers, originDestinations } = body;
            if (!mfRef || !passengers?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'mfRef and passengers are required' }, 400);
            }
            if (!originDestinations?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'originDestinations is required' }, 400);
            }

            console.log(`[mystifly-reissue] ReissueQuote for ${mfRef}`, JSON.stringify(originDestinations));
            const raw = await reissueQuote(mfRef, passengers, originDestinations as ReissueOriginDestination[]);
            const durationMs = Date.now() - startMs;
            console.log(`[mystifly-reissue] ReissueQuote response:`, JSON.stringify(raw).slice(0, 600));

            if (!raw.Success) {
                const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
                const msg = errors[0]?.Message ?? raw.Message ?? 'ReissueQuote failed';
                return jsonResponse(corsHeaders, { success: false, error: msg, durationMs });
            }

            const data = raw.Data ?? raw;
            return jsonResponse(corsHeaders, {
                success: true,
                ptrId: data.PTRId ?? null,
                ptrStatus: data.PTRStatus ?? null,
                priceChange: data.PriceChange ?? data.TotalPriceChange ?? null,
                passengerChanges: data.PassengerChanges ?? data.ExchangeQuotes ?? [],
                totalAmountChanges: data.TotalAmountChanges ?? [],
                mfRef: data.MfRef ?? mfRef,
                durationMs,
            });
        }

        // ── Step 2: Accept Reissue (AcceptQuote: "Accept") ──────────
        if (step === 'execute') {
            const { mfRef, passengers, ptrId, originDestinations, bookingId } = body;
            if (!mfRef || !passengers?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'mfRef and passengers are required' }, 400);
            }
            if (!originDestinations?.length) {
                return jsonResponse(corsHeaders, { success: false, error: 'originDestinations is required' }, 400);
            }

            console.log(`[mystifly-reissue] Accept Reissue for ${mfRef}, ptrId: ${ptrId}`);
            const raw = await executeReissue(
                mfRef, passengers, Number(ptrId ?? 0),
                originDestinations as ReissueOriginDestination[],
            );
            const durationMs = Date.now() - startMs;
            console.log(`[mystifly-reissue] Accept response:`, JSON.stringify(raw).slice(0, 600));

            if (!raw.Success) {
                const errors: any[] = raw.Data?.Errors ?? raw.Errors ?? [];
                const msg = errors[0]?.Message ?? raw.Message ?? 'Reissue failed';
                return jsonResponse(corsHeaders, { success: false, error: msg, durationMs });
            }

            if (bookingId) {
                try {
                    const supabaseUrl = Deno.env.get('SUPABASE_URL');
                    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
                    if (supabaseUrl && serviceRoleKey) {
                        const supabase = createClient(supabaseUrl, serviceRoleKey);
                        await supabase
                            .from('flight_bookings')
                            .update({ status: 'reissued', notes: `Reissue confirmed — MF: ${mfRef}, PTR: ${ptrId}` })
                            .eq('id', bookingId);
                    }
                } catch (dbErr: any) {
                    console.error('[mystifly-reissue] DB update error:', dbErr.message);
                }
            }

            const data = raw.Data ?? raw;
            return jsonResponse(corsHeaders, {
                success: true,
                ptrId: data.PTRId ?? ptrId ?? null,
                ptrStatus: data.PTRStatus ?? null,
                newPnr: data.UniqueID ?? data.NewPNR ?? null,
                message: data.Message ?? 'Reissue accepted successfully.',
                durationMs,
            });
        }

    } catch (err: any) {
        const durationMs = Date.now() - startMs;
        console.error('[mystifly-reissue] Error:', err.message);
        const status = err instanceof MystiflyError ? Math.max(err.status, 400) : 500;
        return jsonResponse(corsHeaders, { success: false, error: err.message || 'Reissue failed', durationMs }, status);
    }

    return jsonResponse(corsHeaders, { success: false, error: 'Unexpected end of handler' }, 500);
});

function jsonResponse(headers: Record<string, string>, body: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
    });
}
