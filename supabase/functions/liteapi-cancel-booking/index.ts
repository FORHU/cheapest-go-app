import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Declare Deno to avoid lint errors in this environment
declare const Deno: any;

Deno.serve(async (req: any) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');

    try {
        if (!LITEAPI_KEY) {
            throw new Error("Missing LITEAPI_KEY configuration");
        }

        console.log(`[CancelBooking] Version: v2 - increased timeout to 30s`);

        let requestText = "";
        try {
            requestText = await req.text();
            console.log(`[CancelBooking] Raw Body Length: ${requestText.length}`);
        } catch (readError: any) {
            throw new Error(`Failed to read request body: ${readError.message}`);
        }

        if (!requestText) {
            throw new Error("Request body is empty");
        }

        let body;
        try {
            body = JSON.parse(requestText);
        } catch (e: any) {
            throw new Error(`Failed to parse request body: ${e.message}`);
        }

        const { bookingId } = body;
        console.log("Cancelling booking:", bookingId);

        if (!bookingId) throw new Error("Missing bookingId");

        // LiteAPI booking cancellation endpoint
        const url = `https://api.liteapi.travel/v3.0/bookings/${bookingId}`;
        const FETCH_TIMEOUT = 30000; // 30 second timeout (LiteAPI cancellation can be slow)

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        let liteResponse;
        try {
            liteResponse = await fetch(url, {
                method: "PUT",
                headers: {
                    'X-API-Key': LITEAPI_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({}),
                signal: controller.signal
            });
        } catch (fetchErr: any) {
            if (fetchErr.name === 'AbortError') {
                throw new Error('Cancellation request timed out. Please try again.');
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }

        console.log(`LiteAPI Cancel Status:`, liteResponse.status);

        const liteResponseText = await liteResponse.text();
        console.log("CancelBooking LiteAPI Raw Response:", liteResponseText.substring(0, 500));

        let result;
        try {
            result = liteResponseText ? JSON.parse(liteResponseText) : {};
        } catch (e) {
            throw new Error("Invalid JSON response from booking provider");
        }

        if (!liteResponse.ok) {
            console.error("========== CANCELLATION FAILED ==========");
            console.error("HTTP Status:", liteResponse.status);
            console.error("Full Result Object:", JSON.stringify(result, null, 2));
            console.error("==========================================");

            const errorMessage = result.error?.message || result.message || result.error || `Cancellation failed with status ${liteResponse.status}`;
            throw new Error(errorMessage);
        }

        // NOTE: Do NOT update booking status here.
        // Status management (cancelled, cancelled_refunded, etc.) is handled
        // by cancelBooking() in bookings.ts to avoid conflicting updates.

        // Return response with refund info if available
        const response = {
            data: {
                bookingId: bookingId,
                status: 'cancelled',
                cancellationId: result.data?.cancellationId,
                refund: result.data?.refund || result.data?.cancellation?.refund
            }
        };

        return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error("CancelBooking Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
