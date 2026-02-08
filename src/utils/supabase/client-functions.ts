/**
 * Client-side Edge Function invocation.
 *
 * Only use for user-triggered, non-sensitive operations (e.g. autocomplete, search).
 * For mutations and sensitive queries, use server actions with the server-side
 * equivalent in `@/utils/supabase/functions.ts`.
 */
import { createClient } from './client';

export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body?: any,
    options?: { headers?: Record<string, string>; method?: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH' }
) {
    // Use direct HTTP fetch to bypass Supabase client auth issues on server side (and client side consistency)
    // This matches the robust implementation in src/utils/supabase/functions.ts
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
    const method = options?.method || 'POST';

    // console.log(`[invokeEdgeFunction] Calling ${functionUrl}`);

    const response = await fetch(functionUrl, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            ...options?.headers
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        let errorText = '';
        try {
            errorText = await response.text();
            console.error(`[invokeEdgeFunction] ${functionName} ERROR ${response.status}:`, errorText);

            // Try to parse JSON error from Edge Function if available
            try {
                const jsonError = JSON.parse(errorText);
                if (jsonError.error) errorText = jsonError.error;
            } catch (ignore) { }
        } catch (e) {
            console.error(`[invokeEdgeFunction] Failed to read error text`, e);
            errorText = 'Could not read error response';
        }
        if (errorText.includes("Connection Failed") || errorText.includes("Stream Failed") || response.status === 400) {
            errorText += "\n\n(Note: Your booking session may have expired. Please go back and search for the room again.)";
        }
        throw new Error(`${errorText || response.statusText || 'Unknown error'}`);
    }

    const responseData = await response.json();

    // Fix for double-wrapping issue with LiteAPI proxies
    // If the response is { data: [...] } and we wrap it in { data: responseData }, 
    // the caller gets { data: { data: [...] } }.
    // We want the caller to get { data: [...] } (where .data is the array).

    // Check if the response ITSELF has a 'data' property that looks like what we want
    if (responseData && typeof responseData === 'object' && 'data' in responseData) {
        return { data: responseData.data };
    }

    // Otherwise, assume the entire response is the data (e.g. if it returned an array directly)
    return { data: responseData };

}
