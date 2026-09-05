import { NextRequest, NextResponse } from 'next/server';
import { findConversation, getSupportCaller } from '@/lib/server/support/conversations';
import { subscribe } from '@/lib/server/support/events';
import { getMessage, listMessages } from '@/lib/server/support/messages';

export const dynamic = 'force-dynamic';

/**
 * How long between heartbeats. Idle connections get closed by intermediaries — Cloudflare
 * and the reverse proxy in front of the container both do it — and a comment frame is the
 * cheapest thing that keeps one alive. Comfortably under the usual 60s idle timeouts.
 */
const HEARTBEAT_MS = 25_000;

/**
 * The customer's live view of their conversation.
 *
 * A message written by any process — this one, the other brand's instance, a background
 * AI turn — arrives here through Postgres LISTEN/NOTIFY, because the two EC2 instances
 * share only the database. See `lib/server/support/events.ts`.
 */
export async function GET(req: NextRequest) {
    const caller = await getSupportCaller();
    const conversation = await findConversation(caller);
    if (!conversation) {
        return NextResponse.json({ error: 'No conversation' }, { status: 404 });
    }

    const since = req.nextUrl.searchParams.get('since');
    const conversationId = conversation.id;
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
                    // The client went away between our check and this write.
                    closed = true;
                }
            };

            const send = (event: string, data: unknown) => {
                write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            };

            const close = () => {
                if (closed) return;
                closed = true;
                if (heartbeat) clearInterval(heartbeat);
                if (unsubscribe) unsubscribe();
                try { controller.close(); } catch { /* already closed */ }
            };

            // Whatever was missed while the stream was down, before any live message, so
            // the client never has to reorder around a gap.
            try {
                const backfill = await listMessages(conversationId, since);
                for (const message of backfill) send('message', message);
            } catch (err) {
                console.error('[support/stream] backfill failed:', err);
            }

            send('ready', { conversationId, status: conversation.status });

            try {
                unsubscribe = await subscribe(conversationId, event => {
                    // The notify carries ids only; the row is read here so a long message
                    // never has to fit through the 8000-byte NOTIFY payload.
                    getMessage(event.messageId)
                        .then(message => { if (message) send('message', message); })
                        .catch(err => console.error('[support/stream] read failed:', err));
                });
            } catch (err) {
                console.error('[support/stream] subscribe failed:', err);
                send('error', { error: 'Live updates unavailable' });
                close();
                return;
            }

            heartbeat = setInterval(() => {
                write(': keepalive\n\n');
                if (closed) close();
            }, HEARTBEAT_MS);

            // Client navigated away, closed the widget, or lost the network.
            req.signal.addEventListener('abort', close);
            if (req.signal.aborted) close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // Nginx buffers proxied responses by default, which holds every frame until
            // the response ends — for a stream that never ends, that is silence.
            'X-Accel-Buffering': 'no',
        },
    });
}
