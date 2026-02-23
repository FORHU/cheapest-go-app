/**
 * Mystifly Create Session — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-create-session
 *
 * Creates a Mystifly API session via the shared client.
 * Returns a sessionId + conversationId for subsequent API calls.
 * Session is valid for ~60 minutes; the shared client caches and
 * auto-refreshes at 55 minutes.
 *
 * Credentials are never exposed — they stay in Supabase Edge Function secrets:
 *   MYSTIFLY_USERNAME, MYSTIFLY_PASSWORD, MYSTIFLY_ACCOUNT_NUMBER
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { createSession, MystiflyError } from '../_shared/mystiflyClient.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigin = ALLOWED_ORIGINS.length > 0
        ? (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
        : '*';
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startMs = Date.now();

    try {
        console.log('[mystifly-create-session] Creating session');

        const sessionId = await createSession();
        const conversationId = crypto.randomUUID();

        const durationMs = Date.now() - startMs;

        console.log(`[mystifly-create-session] Session acquired in ${durationMs}ms`);

        return new Response(
            JSON.stringify({
                success: true,
                sessionId,
                conversationId,
                expiresIn: 3600,
                durationMs,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        const durationMs = Date.now() - startMs;

        // Never leak credential details in error responses
        const safeMessage = err instanceof MystiflyError && err.type === 'AUTH'
            ? 'Authentication failed — check Mystifly credentials in Edge Function secrets'
            : (err.message || 'Session creation failed');

        console.error('[mystifly-create-session] Error:', err.message);

        return new Response(
            JSON.stringify({
                success: false,
                error: safeMessage,
                durationMs,
            }),
            { status: err instanceof MystiflyError ? Math.max(err.status, 400) : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
