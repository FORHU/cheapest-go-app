/**
 * Turns a stream of real DOM activity events into at most one `/api/auth/presence` POST per
 * minute. Pure and timer-free on purpose — `useIdlePresence` owns the event listeners and
 * the `fetch` call; this is only the arithmetic, which is what makes the boundary cheap to
 * pin down here instead of re-deriving it inside a `renderHook` test.
 */

/** How often a Presence ping is allowed to reach the server, at most. */
export const PRESENCE_PING_MIN_INTERVAL_MS = 60_000;

export function shouldSendPresencePing(
    lastPingAt: number | null,
    now: number,
    minIntervalMs: number = PRESENCE_PING_MIN_INTERVAL_MS,
): boolean {
    if (lastPingAt === null) return true;
    return now - lastPingAt >= minIntervalMs;
}
