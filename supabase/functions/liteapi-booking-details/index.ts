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

    const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');

    try {
        if (!LITEAPI_KEY) {
            throw new Error("Missing LITEAPI_KEY configuration");
        }

        console.log(`[BookingDetails] Version: v1`);

        let requestText = "";
        try {
            requestText = await req.text();
            console.log(`[BookingDetails] Raw Body Length: ${requestText.length}`);
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
        console.log("Fetching booking details for:", bookingId);

        if (!bookingId) throw new Error("Missing bookingId");

        // LiteAPI booking retrieve endpoint
        const url = `https://api.liteapi.travel/v3.0/bookings/${bookingId}`;

        const liteResponse = await fetch(url, {
            method: "GET",
            headers: {
                'X-API-Key': LITEAPI_KEY,
                'Accept': 'application/json'
            }
        });

        console.log(`LiteAPI Status:`, liteResponse.status);

        const liteResponseText = await liteResponse.text();
        console.log("BookingDetails LiteAPI Raw Response:", liteResponseText.substring(0, 500));

        let result;
        try {
            result = liteResponseText ? JSON.parse(liteResponseText) : {};
        } catch (e) {
            throw new Error("Invalid JSON response from booking provider");
        }

        if (!liteResponse.ok) {
            console.error("========== BOOKING DETAILS FAILED ==========");
            console.error("HTTP Status:", liteResponse.status);
            console.error("Full Result Object:", JSON.stringify(result, null, 2));
            console.error("=============================================");

            const errorMessage = result.error?.message || result.message || result.error || `Failed to fetch booking details with status ${liteResponse.status}`;
            throw new Error(errorMessage);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error("BookingDetails Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
