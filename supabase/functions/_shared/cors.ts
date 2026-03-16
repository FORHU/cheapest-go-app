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
    
    // Default CORS headers
    const headers: Record<string, string> = {
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-customer-email, x-customer-name',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    };

    // If the origin is in our allowed list, reflect it back
    let allowedOrigin = '*';
    
    const isAllowed = (origin: string) => {
        if (!origin) return false;
        if (ALLOWED_ORIGINS.includes(origin)) return true;
        
        // Allow subdomains of cheapestgo.com and judayajohnray.com
        const domainPattern = /^(https?:\/\/)?([\w-]+\.)*(cheapestgo\.com|judayajohnray\.com|localhost)(:\d+)?$/i;
        if (domainPattern.test(origin)) return true;
        
        return false;
    };

    if (origin && isAllowed(origin)) {
        allowedOrigin = origin;
    } else if (ALLOWED_ORIGINS.length > 0) {
        // Fallback to the first allowed origin if it's a known mismatch but we want to be safe,
        // OR just keep '*' if it's completely unknown. 
        // Returning '*' is actually safer for browser preflights if we don't use credentials.
        allowedOrigin = '*'; 
        if (origin) {
            console.warn(`[cors] Origin mismatch. Requested: "${origin}", Allowed: ${JSON.stringify(ALLOWED_ORIGINS)}. Defaulting to *`);
        }
    }

    headers['Access-Control-Allow-Origin'] = allowedOrigin;

    return headers;
}
