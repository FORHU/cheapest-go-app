
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

    try {
        const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');
        if (!LITEAPI_KEY) {
            throw new Error("Missing LITEAPI_KEY configuration");
        }

        // Debugging: Log incoming request details
        console.log(`[Prebook] Version: v2-PRODUCTION`);
        console.log(`[Prebook] Method: ${req.method}`);

        // Read raw text first
        let requestText = "";
        try {
            requestText = await req.text();
            console.log(`[Prebook] Raw Body Length: ${requestText.length}`);
            console.log(`[Prebook] Raw Body Preview: ${requestText.substring(0, 200)}...`);
        } catch (readError: any) {
            throw new Error(`Failed to read request body (Stream Error): ${readError.message}`);
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

        const { offerId, currency, guestNationality, voucherCode } = body;

        console.log("Prebook Request for offerId:", offerId);
        if (voucherCode) console.log("Prebook with voucherCode:", voucherCode);

        if (!offerId) {
            throw new Error("Missing offerId in request body");
        }

        const payload: Record<string, any> = {
            offerId,
            currency: currency || "USD",
            guestNationality: guestNationality || "PH",
            usePaymentSdk: true,  // Required for Payment SDK + voucher support
        };

        // Include voucher code when provided
        if (voucherCode) {
            payload.voucherCode = voucherCode;
        }

        console.log("Prebook Payload:", JSON.stringify(payload));

        const endpoints = [
            `https://book.liteapi.travel/v3.0/rates/prebook`,
            `https://api.liteapi.travel/v3.0/hotels/rates/prebook`,
            `https://api.liteapi.travel/v3.0/rates/prebook`
        ];

        const MAX_RETRIES = 2; // Per endpoint
        const FETCH_TIMEOUT = 10000; // 10 second timeout
        const RETRY_DELAY = 200; // 200ms between retries (reduced from 500ms)

        let liteResponse;
        let liteResponseText = "";
        let success = false;
        let lastError;

        outerLoop:
        for (const url of endpoints) {
            console.log(`Trying endpoint: ${url}`);
            for (let i = 0; i < MAX_RETRIES; i++) {
                try {
                    if (i > 0) console.log(`Retry attempt ${i + 1} for ${url}...`);

                    // Create abort controller for timeout
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

                    try {
                        liteResponse = await fetch(url, {
                            method: "POST",
                            headers: {
                                'X-API-Key': LITEAPI_KEY,
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify(payload),
                            signal: controller.signal
                        });
                    } finally {
                        clearTimeout(timeoutId);
                    }

                    console.log(`Endpoint ${url} Status:`, liteResponse.status);

                    // Try reading the stream immediately to confirm it's valid
                    liteResponseText = await liteResponse.text();

                    // If we get here without error, success!
                    success = true;
                    break outerLoop;
                } catch (err: any) {
                    console.error(`Attempt ${i + 1} on ${url} failed:`, err.name === 'AbortError' ? 'Request timed out' : err);
                    lastError = err;
                    // Wait briefly before retry
                    await new Promise(r => setTimeout(r, RETRY_DELAY));
                }
            }
        }

        if (!success) {
            throw new Error(`LiteAPI Connection Failed (All Endpoints): ${lastError?.message || "Stream Error"}`);
        }

        console.log("Prebook LiteAPI Raw Response:", liteResponseText.substring(0, 1000));


        let result;
        try {
            result = liteResponseText ? JSON.parse(liteResponseText) : {};
        } catch (e) {
            console.error("Failed to parse LiteAPI response:", liteResponseText);
            throw new Error("Invalid JSON response from booking provider");
        }

        if (!liteResponse || !liteResponse.ok) {
            console.error("Prebook Failed:", JSON.stringify(result));
            throw new Error(result.error?.message || `Prebook failed with status ${liteResponse?.status}`);
        }

        // Log prebook response details
        const prebookData = result.data || result;
        console.log("[Prebook] cancellationPolicies:", JSON.stringify(prebookData.cancellationPolicies)?.substring(0, 500));
        console.log("[Prebook] refundableTag:", prebookData.cancellationPolicies?.refundableTag);
        console.log("[Prebook] secretKey present:", !!prebookData.secretKey);
        console.log("[Prebook] transactionId:", prebookData.transactionId);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error("Prebook Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
