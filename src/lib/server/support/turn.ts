import { getSqlAdmin } from '@/lib/db/postgres';
import { rateLimit } from '@/lib/server/rate-limit';
import { requestHuman } from './conversations';
import { appendMessage, listMessages } from './messages';
import { runSupportTurn, type SupportTurnStore, type TurnAllowance } from './responder';
import { supportTools } from './tools';
import { chatCompletionsConfigFromEnv, createChatCompletionsClient } from './chat-completions';
import { liveNotifyDeps, notifyEscalation, type EscalatedConversation } from './notify';
import type { SupportConversation } from './conversations';

/**
 * Everything the responder needs, assembled from the real world, plus the claim that
 * stops two turns running for one conversation.
 */

/**
 * How long a claim is believed before another message may take it over.
 *
 * Longer than any turn should take — a model call plus up to four tools — and short
 * enough that a process killed mid-turn does not silence a conversation for long. It is
 * the recovery window, not a timeout on the model, which has its own.
 */
export const TURN_CLAIM_TIMEOUT_MS = 120_000;

/**
 * The site-wide ceiling on turns per hour. Deliberately generous; its job is to catch a
 * runaway rather than to shape ordinary traffic.
 */
export const MAX_TURNS_PER_HOUR = 2000;

/**
 * Take the right to run a turn for this conversation, or report that someone else has it.
 *
 * One conditional UPDATE, so the decision is Postgres's rather than ours. A read followed
 * by a write would let two requests that arrive together both see "free" and both proceed
 * — which is exactly the case this exists for, since they may not even be on the same
 * instance.
 */
export async function claimTurn(conversationId: string): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql<{ id: string }[]>`
        UPDATE support_conversations
           SET ai_turn_started_at = now()
         WHERE id = ${conversationId}
           AND (ai_turn_started_at IS NULL
                OR ai_turn_started_at < now() - (${TURN_CLAIM_TIMEOUT_MS}::text || ' milliseconds')::interval)
        RETURNING id
    `;
    return rows.length > 0;
}

/** Give the claim back. Safe to call for a conversation that no longer holds one. */
export async function releaseTurn(conversationId: string): Promise<void> {
    const sql = getSqlAdmin();
    await sql`
        UPDATE support_conversations
           SET ai_turn_started_at = NULL
         WHERE id = ${conversationId}
    `;
}

/** The store port over the real tables. */
function liveStore(): SupportTurnStore {
    return {
        async listMessages(conversationId) {
            const messages = await listMessages(conversationId);
            return messages.map(({ senderType, body, noticeCode }) => ({ senderType, body, noticeCode }));
        },
        async appendMessage(message) {
            await appendMessage(message);
        },
        async markWaitingHuman(conversationId, reason) {
            const updated = await requestHuman(conversationId, reason);
            // Only on the transition: `requestHuman` returns null when the conversation
            // was already queued, and ringing the doorbell twice for one customer is noise.
            // Not awaited — the escalation has already happened and must not wait on mail.
            if (updated) void notifyEscalation(toEscalated(updated), liveNotifyDeps());
        },
    };
}

/**
 * The site-wide allowance, on the Postgres-backed limiter that already exists.
 *
 * Keyed on a fixed string rather than on the caller, so every conversation counts against
 * one bucket — which is what makes it a site-wide breaker rather than a per-customer one.
 */
function liveAllowance(req: Request): TurnAllowance {
    return {
        async claim() {
            const result = await rateLimit(req, {
                limit: MAX_TURNS_PER_HOUR,
                windowMs: 60 * 60_000,
                prefix: 'support-turn',
                userId: 'site',
            });
            return result.success;
        },
    };
}

export interface StartSupportTurnInput {
    conversationId: string;
    /** From the conversation row, not the request — the owner of the chat. */
    userId: string | null;
    /** Whether an Escalation could be answered: a session, or a guest who left details. */
    canBeQueued: boolean;
    /** Only so the limiter has a Request to satisfy its signature; it is keyed on 'site'. */
    req: Request;
}

/**
 * Run one model turn, if nobody else is already running one.
 *
 * Never throws. It is started without being awaited by `POST /messages`, so an escaping
 * rejection would be an unhandled promise rejection in the process serving every other
 * request. The responder already turns its own failures into a notice and a handover;
 * this catch is for everything around it — the claim, the release, the wiring.
 */
export async function startSupportTurn(input: StartSupportTurnInput): Promise<void> {
    const { conversationId } = input;

    let claimed = false;
    try {
        claimed = await claimTurn(conversationId);
        if (!claimed) {
            // A turn is already running for this conversation. It will read the message
            // that triggered this one, because it reads the transcript when it starts.
            return;
        }

        await runSupportTurn(conversationId, {
            model: createChatCompletionsClient(chatCompletionsConfigFromEnv()),
            store: liveStore(),
            allowance: liveAllowance(input.req),
            tools: supportTools(),
            owner: { userId: input.userId, canBeQueued: input.canBeQueued },
        });
    } catch (err) {
        console.error('[support/turn] turn failed outside the responder:', err);
    } finally {
        if (claimed) {
            await releaseTurn(conversationId).catch(err =>
                // Left behind, but the claim expires on its own, so the conversation
                // recovers on the customer's next message rather than going silent.
                console.error('[support/turn] could not release claim:', err),
            );
        }
    }
}

/** The slice of a conversation the doorbell needs. */
function toEscalated(conversation: SupportConversation): EscalatedConversation {
    return {
        id: conversation.id,
        guestName: conversation.guestName,
        guestEmail: conversation.guestEmail,
        sourceBrand: conversation.sourceBrand,
        // Not on the row type yet — read from the update that just wrote it.
        escalationReason: (conversation as { escalationReason?: string | null }).escalationReason ?? null,
        userId: conversation.userId,
    };
}
