/**
 * Shared CORS helper for Supabase Edge Functions.
 * 
 * Usage:
 * import { getCorsHeaders } from '../_shared/cors.ts';
 * ...
 * const corsHeaders = getCorsHeaders(req);
 * if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
 */

declare const Deno: any;

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o: string) => o.trim()).filter(Boolean);

export function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    
    // If the origin is in our allowed list, reflect it back
    let allowedOrigin = '*';
    
    if (ALLOWED_ORIGINS.length > 0) {
        if (ALLOWED_ORIGINS.includes(origin)) {
            allowedOrigin = origin;
        } else {
            console.warn(`[cors] Origin mismatch. Requested: "${origin}", Allowed: ${JSON.stringify(ALLOWED_ORIGINS)}`);
            allowedOrigin = ALLOWED_ORIGINS[0];
        }
    }

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-customer-email, x-customer-name',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    };
}
