'use client';

import { useEffect, useState } from 'react';

/**
 * How many Support Chats are waiting for a person, for the sidebar badge.
 *
 * Polled rather than streamed. The badge's job is to interrupt an Agent working somewhere
 * else in the admin, and a minute late is fine for that — the moment they click through,
 * the inbox gives them the live view. A second SSE connection held open on every admin
 * page, for a number that changes a few times a day, would cost more than it is worth.
 *
 * Returns 0 on any failure. A badge is a claim about how many people are waiting; silent
 * is better than confidently wrong.
 */

/** Slow enough to be cheap, fast enough that nobody waits long to be noticed. */
export const SUPPORT_WAITING_POLL_MS = 60_000;

export function useSupportWaiting(): number {
    const [waiting, setWaiting] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const read = async () => {
            try {
                const response = await fetch('/api/admin/support/counts');
                if (!response.ok) return;
                const data = (await response.json()) as { waiting?: number };
                if (!cancelled && typeof data.waiting === 'number') setWaiting(data.waiting);
            } catch {
                // Offline, or signed out in another tab. Leave the last number alone.
            }
        };

        void read();
        const timer = setInterval(read, SUPPORT_WAITING_POLL_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    return waiting;
}
