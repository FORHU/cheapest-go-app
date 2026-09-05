import postgres from 'postgres';
import { getSqlAdmin } from '@/lib/db/postgres';

/**
 * Delivery of new support messages to whoever is holding a stream open.
 *
 * The app runs as several Node processes against one RDS — CheapestGo and GeomeeGo are
 * separate EC2 instances (ADR-0005), and a guest can be on one while the agent answering
 * them is on the other. An in-process EventEmitter would work perfectly in development
 * and drop every cross-instance message in production, silently, which is the worst shape
 * a bug can have. So the hop goes through the database both processes already share.
 *
 * Postgres is the bus, not the queue: `pg_notify` carries only the ids, and each listener
 * reads the row itself. That keeps the payload far below the 8000-byte NOTIFY ceiling a
 * long message would otherwise breach, and means a listener that connects late reads
 * current rows rather than replaying a stale copy.
 */

const CHANNEL = 'support_chat';

export interface SupportEvent {
    conversationId: string;
    messageId: string;
}

type Handler = (event: SupportEvent) => void;

/** Subscribers for one conversation, plus the `null` bucket watching all of them. */
const byConversation = new Map<string, Set<Handler>>();
const watchingAll = new Set<Handler>();

/**
 * A connection of its own, rather than one from the admin pool.
 *
 * `sql.listen()` holds its connection for as long as it is listening. Taking that from a
 * pool sized `max: 5` would spend a fifth of the app's database capacity on a socket that
 * never runs a query.
 */
let listener: postgres.Sql | null = null;
let listening: Promise<void> | null = null;

function listenerClient(): postgres.Sql {
    if (!listener) {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('[support/events] DATABASE_URL is not set');
        listener = postgres(url, {
            max: 1,
            idle_timeout: 0, // A listener that is idle is a listener doing its job.
            connect_timeout: 10,
            onnotice: () => {},
        });
    }
    return listener;
}

/**
 * Attach the process-wide LISTEN, once.
 *
 * postgres.js re-issues LISTEN for every registered channel when the connection drops and
 * comes back, so a database restart does not leave this process deaf.
 */
function ensureListening(): Promise<void> {
    if (!listening) {
        listening = listenerClient()
            .listen(CHANNEL, payload => {
                let event: SupportEvent;
                try {
                    const parsed = JSON.parse(payload) as { c?: unknown; m?: unknown };
                    if (typeof parsed.c !== 'string' || typeof parsed.m !== 'string') return;
                    event = { conversationId: parsed.c, messageId: parsed.m };
                } catch {
                    return; // Not ours, or truncated. Nothing sensible to do with it.
                }

                for (const handler of byConversation.get(event.conversationId) ?? []) {
                    try { handler(event); } catch { /* one dead stream must not stop the rest */ }
                }
                for (const handler of watchingAll) {
                    try { handler(event); } catch { /* as above */ }
                }
            })
            .then(() => undefined)
            .catch(err => {
                // Let the next subscriber retry rather than caching the failure forever.
                listening = null;
                throw err;
            });
    }
    return listening;
}

/**
 * Watch for new messages. Pass a conversation id, or null to watch every conversation
 * (which is what the agent inbox wants).
 *
 * Returns the unsubscribe. Callers must run it when their stream closes; the set it
 * removes from is the only thing keeping a disconnected client's closure alive.
 */
export async function subscribe(
    conversationId: string | null,
    handler: Handler,
): Promise<() => void> {
    await ensureListening();

    if (conversationId === null) {
        watchingAll.add(handler);
        return () => { watchingAll.delete(handler); };
    }

    let handlers = byConversation.get(conversationId);
    if (!handlers) {
        handlers = new Set();
        byConversation.set(conversationId, handlers);
    }
    handlers.add(handler);

    return () => {
        const current = byConversation.get(conversationId);
        if (!current) return;
        current.delete(handler);
        if (current.size === 0) byConversation.delete(conversationId);
    };
}

/**
 * Announce a message to every process, including this one.
 *
 * Deliberately not combined with the insert: NOTIFY inside a transaction fires on commit,
 * and the caller may want the row visible before anyone is told about it.
 */
export async function publish(event: SupportEvent): Promise<void> {
    const payload = JSON.stringify({ c: event.conversationId, m: event.messageId });
    const sql = getSqlAdmin();
    await sql`SELECT pg_notify(${CHANNEL}, ${payload})`;
}

/** Test seam: drop subscribers and the listening connection. */
export async function resetSupportEvents(): Promise<void> {
    byConversation.clear();
    watchingAll.clear();
    listening = null;
    if (listener) {
        const client = listener;
        listener = null;
        await client.end({ timeout: 1 }).catch(() => {});
    }
}
