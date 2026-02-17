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

        console.log(`[AmendBooking] Version: v2`);

        // Read and parse request body
        let requestText = "";
        try {
            requestText = await req.text();
            console.log(`[AmendBooking] Raw Body Length: ${requestText.length}`);
            console.log(`[AmendBooking] Raw Body Preview: ${requestText.substring(0, 300)}`);
        } catch (readError: any) {
            throw new Error(`Failed to read request body: ${readError.message}`);
        }

        if (!requestText || requestText.trim().length === 0) {
            throw new Error("Request body is empty");
        }

        let body;
        try {
            body = JSON.parse(requestText.trim());
        } catch (e: any) {
            console.error("[AmendBooking] JSON parse error. Raw body:", JSON.stringify(requestText));
            throw new Error(`Invalid request body JSON: ${e.message}`);
        }

        const { bookingId, firstName, lastName, email, remarks } = body;
        console.log("Amending booking:", bookingId, "firstName:", firstName, "lastName:", lastName);

        if (!bookingId) throw new Error("Missing bookingId");
        if (!firstName) throw new Error("Missing firstName");
        if (!lastName) throw new Error("Missing lastName");
        if (!email) throw new Error("Missing email");

        // LiteAPI booking amend endpoint
        const url = `https://book.liteapi.travel/v3.0/bookings/${bookingId}/amend`;
        const FETCH_TIMEOUT = 30000;

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        // Build payload — omit undefined values
        const amendPayload: Record<string, string> = { firstName, lastName, email };
        if (remarks) amendPayload.remarks = remarks;

        let liteResponse;
        try {
            liteResponse = await fetch(url, {
                method: "PUT",
                headers: {
                    'X-API-Key': LITEAPI_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(amendPayload),
                signal: controller.signal
            });
        } catch (fetchErr: any) {
            if (fetchErr.name === 'AbortError') {
                throw new Error('Amendment request timed out. Please try again.');
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }

        console.log(`LiteAPI Amend Status:`, liteResponse.status);

        // Safely read LiteAPI response — may be empty for successful amendments
        let liteResponseText = "";
        try {
            liteResponseText = await liteResponse.text();
        } catch (_readErr) {
            liteResponseText = "";
        }
        console.log("AmendBooking LiteAPI Raw Response:", (liteResponseText || "(empty)").substring(0, 500));

        // Parse response — handle empty/non-JSON responses gracefully
        let result: any = {};
        if (liteResponseText && liteResponseText.trim().length > 0) {
            try {
                result = JSON.parse(liteResponseText.trim());
            } catch (_parseErr) {
                console.warn("[AmendBooking] Could not parse LiteAPI response as JSON, treating as empty object");
                result = {};
            }
        }

        let liteApiSuccess = liteResponse.ok;

        if (!liteResponse.ok) {
            console.error("========== LiteAPI AMENDMENT FAILED ==========");
            console.error("HTTP Status:", liteResponse.status);
            console.error("Full Result Object:", JSON.stringify(result, null, 2));
            console.error("Falling back to local DB update only");
            console.error("=======================================");
            // Don't throw — fall through to update local DB
        }

        // Always update holder information in local database
        // Even if LiteAPI fails (sandbox limitations, expired sessions, etc.)
        console.log("Updating holder information in database...");
        const updatedAt = new Date().toISOString();

        const { error: dbError } = await supabaseAdmin
            .from('bookings')
            .update({
                holder_first_name: firstName,
                holder_last_name: lastName,
                holder_email: email,
                special_requests: remarks || null,
                updated_at: updatedAt
            })
            .eq('booking_id', bookingId);

        if (dbError) {
            console.error("Database Update Error:", dbError);
            throw new Error("Failed to update booking in database");
        }

        const response = {
            data: {
                bookingId: bookingId,
                status: 'amended',
                liteApiSynced: liteApiSuccess,
                ...(liteApiSuccess ? result.data : {})
            }
        };

        return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error("AmendBooking Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
