/**
 * Sanitize errors before returning them to API clients.
 *
 * In production, never expose raw exception messages (which may contain
 * stack traces, SQL snippets, or internal paths). Log the full error
 * server-side and return a generic message to the caller.
 *
 * In development, return the real message so debugging is fast.
 */
export function safeError(err: unknown, logContext?: string): string {
    const full = err instanceof Error ? err.message : String(err);

    if (logContext) {
        console.error(`[${logContext}]`, err);
    }

    if (process.env.NODE_ENV === 'production') {
        return 'An unexpected error occurred. Please try again.';
    }

    return full;
}
