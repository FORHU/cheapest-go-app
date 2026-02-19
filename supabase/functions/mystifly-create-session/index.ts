/**
 * Mystifly Create Session — Supabase Edge Function
 *
 * POST /functions/v1/mystifly-create-session
 *
 * Creates or refreshes a Mystifly API session.
 * Returns a sessionId that is required for all subsequent Mystifly API calls.
 * The session is valid for ~60 minutes.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

import { createSession } from '../_shared/mystiflyClient.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    // ── CORS Preflight ──
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log('[mystifly-create-session] Creating session');

        // TODO: Call Mystifly CreateSession API
        // const sessionId = await createSession();
        const sessionId = ''; // placeholder

        console.log('[mystifly-create-session] Session created successfully');

        return new Response(
            JSON.stringify({
                success: true,
                sessionId,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        console.error('[mystifly-create-session] Error:', err.message);
        return new Response(
            JSON.stringify({ success: false, error: err.message || 'Session creation failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
