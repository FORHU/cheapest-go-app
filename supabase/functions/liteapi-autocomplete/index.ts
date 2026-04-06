
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: any;

// ── Rate Limiting (per IP address) ──────────────────────────────
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20; // 20 autocomplete requests per minute per IP
const attempts = new Map<string, number[]>();

// Periodic cleanup to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    attempts.forEach((timestamps, ip) => {
        const recent = timestamps.filter((t: number) => now - t < WINDOW_MS);
        if (recent.length === 0) attempts.delete(ip);
        else attempts.set(ip, recent);
    });
}, 60_000); // Clean every 1 minute

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const timestamps = attempts.get(ip) ?? [];
    const recent = timestamps.filter((t: number) => now - t < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS) {
        attempts.set(ip, recent);
        return true;
    }
    recent.push(now);
    attempts.set(ip, recent);
    return false;
}

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

        // ── Rate limiting check ──
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                         req.headers.get('x-real-ip') ||
                         'unknown';

        if (isRateLimited(clientIp)) {
            console.log(`[Rate Limit] IP ${clientIp} exceeded autocomplete rate limit`);
            return new Response(JSON.stringify({
                error: 'Too many requests. Please slow down.'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
                status: 429
            });
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
