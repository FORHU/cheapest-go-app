export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body?: any,
    options?: { headers?: Record<string, string>; method?: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH' }
) {
    let supabase;

    if (typeof window === 'undefined') {
        // Server-side
        const { createClient } = await import('./server');
        supabase = await createClient();
    } else {
        // Client-side
        const { createClient } = await import('./client');
        supabase = createClient();
    }

    const { data, error } = await supabase.functions.invoke<T>(functionName, {
        body,
        headers: options?.headers,
        method: options?.method || 'POST',
    });

    if (error) {
        let responseBody = '';
        try {
            // Check if we can read the response body from the error context or if we need to do it differently
            // The Supabase client might wrap the error.
            // If error is just an object, we serialize it.
            responseBody = JSON.stringify(error);

            // Attempt to inspect if it's a specific HTTP error structure
            if ('context' in error && error.context && 'json' in error.context && typeof error.context.json === 'function') {
                const json = await error.context.json();
                responseBody = JSON.stringify(json);
            }
        } catch (e) {
            responseBody = 'Could not read response body';
        }

        throw new Error(`Error invoking ${functionName}: ${error.message || 'Unknown error'} (Status: ${error.code || 'Unknown'}). details: ${responseBody}`);
    }

    return data;
}

// Specific helper for liteapi-search
export async function searchLiteApi(params: any) {
    return invokeEdgeFunction('liteapi-search', params);
}

// Specific helper for pre-book
export async function preBook(params: any) {
    return invokeEdgeFunction('pre-book', params);
}

// Specific helper for fetching hotel details
export async function getHotelDetails(hotelId: string, options: any = {}) {
    const { checkIn, checkOut, adults, children } = options;
    const result = await searchLiteApi({
        hotelIds: [hotelId],
        checkin: checkIn,  // Edge function expects lowercase
        checkout: checkOut,
        adults,
        children
    });
    return result?.data?.[0] || null;
}
