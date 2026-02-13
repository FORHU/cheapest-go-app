
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: any;

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');
        if (!LITEAPI_KEY) {
            throw new Error("LITEAPI_KEY is not set in Edge Function secrets.");
        }

        const { keyword } = await req.json();

        if (!keyword || keyword.length < 2) {
            return new Response(JSON.stringify({ data: [] }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        }

        // Endpoint for Auto-complete / Places
        // Using /data/places with textQuery parameter (per documentation/research)
        const url = `https://api.liteapi.travel/v3.0/data/places?textQuery=${encodeURIComponent(keyword)}`;

        console.log(`Fetching LiteAPI Places: ${url}`);

        const res = await fetch(url, {
            method: "GET",
            headers: {
                'X-API-Key': LITEAPI_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            const text = await res.text();
            console.error(`LiteAPI Error ${res.status}: ${text}`);
            throw new Error(`LiteAPI returned ${res.status}`);
        }

        const data = await res.json();

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }
});
