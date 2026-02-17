import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: any;

const LITEAPI_VOUCHERS_BASE = 'https://da.liteapi.travel';

Deno.serve(async (req: any) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');
        if (!LITEAPI_KEY) {
            throw new Error('Missing LITEAPI_KEY configuration');
        }

        const requestText = await req.text();
        if (!requestText) {
            throw new Error('Request body is empty');
        }

        let body;
        try {
            body = JSON.parse(requestText);
        } catch (e: any) {
            throw new Error(`Failed to parse request body: ${e.message}`);
        }

        const { action } = body;
        console.log(`[LiteAPI Vouchers] Action: ${action}`);

        let url: string;
        let method: string;
        let payload: any = undefined;

        switch (action) {
            // Create a new voucher
            case 'create': {
                url = `${LITEAPI_VOUCHERS_BASE}/vouchers`;
                method = 'POST';
                payload = {
                    voucher_code: body.voucher_code,
                    discount_type: body.discount_type || 'percentage',
                    discount_value: body.discount_value,
                    minimum_spend: body.minimum_spend ?? 0,
                    maximum_discount_amount: body.maximum_discount_amount ?? 0,
                    validity_start: body.validity_start,
                    validity_end: body.validity_end,
                    usages_limit: body.usages_limit ?? 100,
                    status: body.status || 'active',
                    terms_and_conditions: body.terms_and_conditions || '',
                };
                break;
            }

            // List all vouchers
            case 'list': {
                url = `${LITEAPI_VOUCHERS_BASE}/vouchers`;
                method = 'GET';
                break;
            }

            // Get voucher by ID
            case 'get': {
                if (!body.voucherId) throw new Error('Missing voucherId');
                url = `${LITEAPI_VOUCHERS_BASE}/vouchers/${body.voucherId}`;
                method = 'GET';
                break;
            }

            // Update voucher (full replace — all fields required)
            case 'update': {
                if (!body.voucherId) throw new Error('Missing voucherId');
                url = `${LITEAPI_VOUCHERS_BASE}/vouchers/${body.voucherId}`;
                method = 'PUT';
                payload = {
                    voucher_code: body.voucher_code,
                    discount_type: body.discount_type || 'percentage',
                    discount_value: body.discount_value,
                    minimum_spend: body.minimum_spend ?? 0,
                    maximum_discount_amount: body.maximum_discount_amount ?? 0,
                    validity_start: body.validity_start,
                    validity_end: body.validity_end,
                    usages_limit: body.usages_limit ?? 100,
                    status: body.status || 'active',
                    terms_and_conditions: body.terms_and_conditions || '',
                };
                break;
            }

            // Toggle voucher status
            case 'toggle-status': {
                if (!body.voucherId) throw new Error('Missing voucherId');
                url = `${LITEAPI_VOUCHERS_BASE}/vouchers/${body.voucherId}/status`;
                method = 'PUT';
                payload = { status: body.status };
                break;
            }

            // Get usage history
            case 'history': {
                url = `${LITEAPI_VOUCHERS_BASE}/vouchers/history`;
                method = 'GET';
                break;
            }

            // Delete voucher
            case 'delete': {
                if (!body.voucherId) throw new Error('Missing voucherId');
                url = `${LITEAPI_VOUCHERS_BASE}/vouchers/${body.voucherId}`;
                method = 'DELETE';
                break;
            }

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        console.log(`[LiteAPI Vouchers] ${method} ${url}`);

        const fetchOptions: any = {
            method,
            headers: {
                'X-API-Key': LITEAPI_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };

        if (payload && (method === 'POST' || method === 'PUT')) {
            fetchOptions.body = JSON.stringify(payload);
        }

        const response = await fetch(url, fetchOptions);
        const responseText = await response.text();

        console.log(`[LiteAPI Vouchers] Status: ${response.status}`);
        console.log(`[LiteAPI Vouchers] Response: ${responseText.substring(0, 500)}`);

        let result;
        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch {
            result = { raw: responseText };
        }

        if (!response.ok) {
            throw new Error(
                result.message || result.error || `LiteAPI Vouchers API failed with status ${response.status}`
            );
        }

        return new Response(JSON.stringify({ success: true, data: result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (error: any) {
        console.error('[LiteAPI Vouchers] Error:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
