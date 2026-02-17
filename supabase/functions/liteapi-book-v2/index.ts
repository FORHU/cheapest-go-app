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

        console.log(`[Book] Version: v2-ROBUST`);

        let requestText = "";
        try {
            requestText = await req.text();
            console.log(`[Book] Raw Body Length: ${requestText.length}`);
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

        const { prebookId, holder, guests, payment, clientReference } = body;
        console.log("Booking Request for prebookId:", prebookId);
        console.log("Payment method:", payment?.method);

        if (!prebookId) throw new Error("Missing prebookId");

        // Build payment object — support TRANSACTION_ID for Payment SDK
        const paymentPayload: Record<string, any> = { method: payment.method };
        if (payment.method === 'TRANSACTION_ID' && payment.transactionId) {
            paymentPayload.transactionId = payment.transactionId;
            console.log("Using Payment SDK transactionId:", payment.transactionId);
        }

        const endpoints = [
            `https://book.liteapi.travel/v3.0/rates/book`,
            `https://api.liteapi.travel/v3.0/rates/book`
        ];

        const MAX_RETRIES = 2; // Per endpoint
        let liteResponse;
        let liteResponseText = "";
        let success = false;
        let lastError;

        const payload = { prebookId, holder, guests, payment: paymentPayload, clientReference };

        outerLoop:
        for (const url of endpoints) {
            console.log(`Trying endpoint: ${url}`);
            for (let i = 0; i < MAX_RETRIES; i++) {
                try {
                    if (i > 0) console.log(`Retry attempt ${i + 1} for ${url}...`);

                    liteResponse = await fetch(url, {
                        method: "POST",
                        headers: {
                            'X-API-Key': LITEAPI_KEY,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });

                    console.log(`Endpoint ${url} Status:`, liteResponse.status);

                    // Try reading the stream immediately
                    liteResponseText = await liteResponse.text();

                    // Mark as connection-level success
                    success = true;
                    break outerLoop;
                } catch (err: any) {
                    console.error(`Attempt ${i + 1} on ${url} failed:`, err);
                    lastError = err;
                    // Wait briefly before retry
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }

        if (!success) {
            throw new Error(`LiteAPI Connection Failed (All Endpoints): ${lastError?.message || "Stream Error"}`);
        }

        console.log("Book LiteAPI Raw Response:", liteResponseText.substring(0, 500));

        let result;
        try {
            result = liteResponseText ? JSON.parse(liteResponseText) : {};
        } catch (e) {
            throw new Error("Invalid JSON response from booking provider");
        }

        if (!liteResponse || !liteResponse.ok) {
            console.error("========== BOOKING FAILED - FULL ERROR DETAILS ==========");
            console.error("HTTP Status:", liteResponse?.status);
            console.error("Full Result Object:", JSON.stringify(result, null, 2));
            console.error("Result.error:", JSON.stringify(result.error, null, 2));
            console.error("Result.message:", result.message);
            console.error("Result.details:", JSON.stringify(result.details, null, 2));
            console.error("Sent Payload:", JSON.stringify(payload, null, 2));
            console.error("========================================================");

            // Return FULL detailed error structure + PAYLOAD for debug
            const errorMessage = result.error?.message || result.message || result.error || `Booking failed with status ${liteResponse?.status}`;
            const details = result.error?.details ? JSON.stringify(result.error.details) : (result.details ? JSON.stringify(result.details) : "");
            throw new Error(`${errorMessage} ${details} | DEBUG_PAYLOAD: ${JSON.stringify(payload)}`);
        }

        // 2. SAVE TO DATABASE
        console.log("Saving booking to database...");

        // Extract price from LiteAPI booking response
        // Based on actual response: data.price = 9548.92
        const extractPrice = () => {
            const data = result.data;
            if (!data) return 0;

            // Primary: data.price (confirmed from actual response)
            if (typeof data.price === 'number') return data.price;
            if (typeof data.sellingPrice === 'string') return parseFloat(data.sellingPrice);

            // Fallback paths
            return data.bookedRooms?.[0]?.amount ||
                   data.rate?.retailRate?.total?.amount ||
                   data.totalAmount ||
                   0;
        };

        // Extract currency from LiteAPI booking response
        // Based on actual response: data.currency = "PHP"
        const extractCurrency = () => {
            const data = result.data;
            if (!data) return "USD";

            // Primary: data.currency (confirmed from actual response)
            return data.currency ||
                   data.bookedRooms?.[0]?.currency ||
                   "USD";
        };

        const totalPrice = extractPrice();
        const currency = extractCurrency();

        console.log("Extracted price:", totalPrice, currency);
        console.log("Full result.data structure:", JSON.stringify(result.data, null, 2).substring(0, 1000));

        // Get current timestamp in ISO format (UTC)
        const bookedAt = new Date().toISOString();
        console.log("Booking timestamp (UTC):", bookedAt);

        const { error: dbError } = await supabaseAdmin
            .from('bookings')
            .insert([{
                booking_id: result.data?.bookingId || "unknown",
                hotel_name: result.data?.hotel?.name || "Unknown Property",
                guest_first_name: guests[0]?.firstName,
                guest_last_name: guests[0]?.lastName,
                total_price: totalPrice,
                currency: currency,
                status: result.data?.status || 'confirmed',
                booked_at: bookedAt,
                payload: result // Save full payload for debug
            }]);

        if (dbError) {
            console.error("Database Save Error:", dbError);
            // We do NOT throw here because the booking was technically successful externally.
            // We just log it.
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error("Booking Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
