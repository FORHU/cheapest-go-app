import { NextRequest, NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { subscribe } from '@/lib/server/support/events';

export const dynamic = 'force-dynamic';

/** Same reasoning as the customer stream: idle connections get closed by intermediaries. */
const HEARTBEAT_MS = 25_000;

/**
 * The inbox's live feed: every conversation, not one.
 *
 * This is the `subscribe(null)` case — an Agent needs to know a conversation arrived that
 * they were not already looking at, which is the whole point of a queue.
 *
 * Only the ids are sent. The Agent's browser then refetches whichever it needs: the open
 * conversation's messages, or the list. Pushing message bodies down this stream would mean
 * every admin tab receiving every customer's words continuously, whether or not anyone is
 * looking at that conversation — a lot of data crossing the wire to be discarded, and a
 * much bigger thing to leak if this route's auth were ever wrong.
 */
export async function GET(req: NextRequest) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false;
            let unsubscribe: (() => void) | null = null;
            let heartbeat: ReturnType<typeof setInterval> | null = null;

            const write = (chunk: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(chunk));
                } catch {
                    closed = true;
                }
            };

            const close = () => {
                if (closed) return;
                closed = true;
                if (heartbeat) clearInterval(heartbeat);
                if (unsubscribe) unsubscribe();
                try { controller.close(); } catch { /* already closed */ }
            };

            write(`event: ready\ndata: {}\n\n`);

            try {
                unsubscribe = await subscribe(null, event => {
                    write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
                });
            } catch (err) {
                console.error('[admin/support/stream] subscribe failed:', err);
                write(`event: error\ndata: {"error":"Live updates unavailable"}\n\n`);
                close();
                return;
            }

            heartbeat = setInterval(() => {
                write(': keepalive\n\n');
                if (closed) close();
            }, HEARTBEAT_MS);

            req.signal.addEventListener('abort', close);
            if (req.signal.aborted) close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
