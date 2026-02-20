import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: any;

Deno.serve(async (req: any) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');
        if (!LITEAPI_KEY) {
            throw new Error("Missing LITEAPI_KEY configuration");
        }

        const body = await req.json();
        const { hotelId, limit = 1000, offset = 0, getSentiment = false } = body;

        console.log(`[Reviews] Fetching reviews for hotelId: ${hotelId}, limit: ${limit}, offset: ${offset}`);

        if (!hotelId) {
            throw new Error("Missing hotelId parameter");
        }

        // Build query parameters
        const params = new URLSearchParams({
            hotelId: hotelId,
            limit: String(limit),
        });

        if (offset > 0) {
            params.append('offset', String(offset));
        }

        if (getSentiment) {
            params.append('getSentiment', 'true');
        }

        const url = `https://api.liteapi.travel/v3.0/data/reviews?${params.toString()}`;
        console.log(`[Reviews] Calling: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-API-Key': LITEAPI_KEY,
                'Accept': 'application/json'
            }
        });

        console.log(`[Reviews] Status: ${response.status}`);

        const responseText = await response.text();
        console.log(`[Reviews] Response preview: ${responseText.substring(0, 300)}`);

        let result;
        try {
            result = responseText ? JSON.parse(responseText) : { data: [] };
        } catch (e) {
            console.error("[Reviews] Failed to parse response:", responseText);
            result = { data: [] };
        }

        if (!response.ok) {
            console.error("[Reviews] API Error:", result);
            // Return empty reviews instead of failing
            return new Response(JSON.stringify({ data: [], error: result.error || 'Failed to fetch reviews' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200, // Return 200 with empty data so UI can handle gracefully
            });
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error("[Reviews] Error:", error);
        return new Response(JSON.stringify({ data: [], error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200, // Return 200 with error so UI handles gracefully
        });
    }
});
