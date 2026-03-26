import { env } from "@/utils/env";

// Slow functions need a longer timeout
const SLOW_FUNCTIONS = new Set([
    'create-booking', 'create-booking-session',
]);

export async function invokeEdgeFunction<T = any>(
    functionName: string,
    body?: any,
    options?: { headers?: Record<string, string>; method?: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH'; timeoutMs?: number }
) {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;

    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
    const method = options?.method || 'POST';
    const timeout = options?.timeoutMs ?? (SLOW_FUNCTIONS.has(functionName) ? 60_000 : 15_000);

    const response = await fetch(functionUrl, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            ...options?.headers
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
        let errorText = '';
        let parsedError: any = null;
        try {
            errorText = await response.text();
            parsedError = JSON.parse(errorText);
        } catch {
            // ignore parse errors — use raw text
        }

        const message: string | undefined =
            parsedError?.error || parsedError?.message || parsedError?.detail;

        if (message) {
            const lower = message.toLowerCase();
            if (lower.includes('no availability') || lower.includes('not available')) {
                throw new Error('This room is no longer available. Please go back and select another room.');
            }
            if (lower.includes('prebook') && (lower.includes('expired') || lower.includes('invalid'))) {
                throw new Error('Your booking session has expired. Please go back and select the room again.');
            }
            throw new Error(message);
        }

        throw new Error(`Error invoking ${functionName}: ${response.statusText || 'Unknown error'} (Status: ${response.status}). details: ${errorText}`);
    }

    const data = await response.json();
    return data as T;
}
