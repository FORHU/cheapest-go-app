
import { createClient } from './client';

export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body?: any,
    options?: { headers?: Record<string, string>; method?: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH' }
) {
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke<T>(functionName, {
        body,
        headers: options?.headers,
        method: options?.method || 'POST',
    });

    if (error) {
        let responseBody = '';
        try {
            responseBody = JSON.stringify(error);
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
