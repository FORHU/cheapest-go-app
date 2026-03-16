/**
 * Duffel API Client for Supabase Edge Functions (Deno).
 *
 * - Bearer token authentication
 * - Environment variable: DUFFEL_ACCESS_TOKEN
 */

declare const Deno: any;

function env(key: string, fallback = ''): string {
    return Deno.env.get(key) ?? fallback;
}

const BASE_URL = 'https://api.duffel.com';
const DUFFEL_VERSION = 'v2';

export async function duffelRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const token = env('DUFFEL_ACCESS_TOKEN');

    if (!token) {
        throw new Error('DUFFEL_ACCESS_TOKEN is not set');
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Duffel-Version': DUFFEL_VERSION,
        ...options.headers,
    };

    console.log(`[Duffel] ${options.method || 'GET'} ${endpoint}`);

    const res = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    const isJson = res.headers.get('content-type')?.includes('application/json');
    let data;

    if (isJson) {
        data = await res.json();
    } else {
        data = await res.text();
    }

    if (!res.ok) {
        console.error(`[Duffel] Error ${res.status}:`, data);
        // Extract user-friendly message from Duffel error response
        const errors = typeof data === 'object' && data?.errors;
        const requestId = typeof data === 'object' && data?.meta?.request_id;
        const firstError = Array.isArray(errors) ? errors[0] : null;
        const userMessage = firstError?.message || (typeof data === 'string' ? data : JSON.stringify(data));
        const err = new Error(
            res.status >= 500
                ? `Duffel API Error: ${res.status} - ${userMessage}${requestId ? ` (request_id: ${requestId})` : ''}`
                : `Duffel API Error: ${res.status} - ${userMessage}`
        );
        (err as any).status = res.status;
        (err as any).requestId = requestId;
        throw err;
    }

    return data as T;
}

export async function createDuffelOfferRequest(payload: any) {
    return duffelRequest('/air/offer_requests', {
        method: 'POST',
        body: JSON.stringify({ data: payload }),
    });
}

export async function createDuffelOrder(payload: any) {
    return duffelRequest('/air/orders', {
        method: 'POST',
        body: JSON.stringify({ data: payload }),
    });
}

export async function getDuffelOrder(orderId: string) {
    return duffelRequest(`/air/orders/${orderId}`, {
        method: 'GET',
    });
}
