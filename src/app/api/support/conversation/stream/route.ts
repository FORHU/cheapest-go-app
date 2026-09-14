import { NextRequest, NextResponse } from 'next/server';
import { findConversation, getConversationStatus, getSupportCaller } from '@/lib/server/support/conversations';
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

            try {
                unsubscribe = await subscribe(conversationId, event => {
                    // A change to the conversation rather than to a message. Assigning it or
                    // giving it back is nothing the customer sees — but being resolved is. It
                    // used to be dropped here with the rest, so a customer whose chat was
                    // resolved kept looking at it as though it were open, until they typed
                    // again (QA BG-17). The status is read fresh; the event names no change.
                    if (!event.messageId) {
                        getConversationStatus(conversationId)
                            .then(status => { if (status === 'resolved') send('status', { conversationId, status }); })
                            .catch(err => console.error('[support/stream] status read failed:', err));
                        return;
                    }

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

            // Only once subscribed, with the status read after it: a resolution landing while
            // the stream was still connecting would otherwise be missed by both, and the widget
            // kept showing a finished chat as open.
            const status = await getConversationStatus(conversationId).catch(() => conversation.status);
            send('ready', { conversationId, status });

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
