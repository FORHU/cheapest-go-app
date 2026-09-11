import { cookies } from 'next/headers';
import { getSqlAdmin } from '@/lib/db/postgres';
import { getSession } from '@/lib/auth/session';
// `mintGuestToken` is deliberately no longer imported: nothing issues a guest token now
// that opening requires an account. `hashGuestToken` stays, because a guest who already
// holds a cookie can still read the transcript that told them to sign in.
import { hashGuestToken, SUPPORT_COOKIE } from './tokens';
import { canonicalBrandName } from '@/lib/brand';
import { attachmentsConfigured } from '@/lib/server/storage/s3';

/**
 * Finding the conversation the caller is entitled to — which, on the guest side, is the
 * whole of the access control.
 *
 * None of the guest routes take a conversation id. Per ADR-0027 authorisation belongs to
 * the resource, and a capability must not sit beside a weaker way of naming the same
 * thing: if a route accepted an id *and* a token, the id would eventually be trusted on
 * its own by some later handler. There is no id to trust here. The caller proves who they
 * are with a Lucia session or a guest token, and the conversation is whatever that
 * credential resolves to.
 */

export type SupportStatus = 'ai_active' | 'waiting_human' | 'human_active' | 'resolved';

export interface SupportConversation {
    id: string;
    userId: string | null;
    guestName: string | null;
    guestEmail: string | null;
    status: SupportStatus;
    sourceBrand: string | null;
    locale: string;
    assignedAdminId: string | null;
    /** The Chat Reference, e.g. CS-9QM2K7. Names the conversation and opens nothing (ADR-0038). */
    reference: string;
    createdAt: string;
    lastMessageAt: string;
}

/** Locales the app serves. Anything else is stored as 'en' rather than trusted. */
const KNOWN_LOCALES = new Set(['en', 'ko', 'ja', 'zh']);

const COLUMNS = `
    id,
    user_id            AS "userId",
    guest_name         AS "guestName",
    guest_email        AS "guestEmail",
    status,
    source_brand       AS "sourceBrand",
    locale,
    assigned_admin_id  AS "assignedAdminId",
    reference,
    created_at         AS "createdAt",
    last_message_at    AS "lastMessageAt"
`;

export function normaliseLocale(locale: unknown): string {
    return typeof locale === 'string' && KNOWN_LOCALES.has(locale) ? locale : 'en';
}

/** Which brand's instance is serving this request. Same source as bookings.source_brand. */
function currentBrand(): string {
    return canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME);
}

export interface SupportCaller {
    userId: string | null;
    /** The raw cookie value, present only for a guest who has been here before. */
    guestToken: string | null;
}

/**
 * Who is asking. A signed-in user is identified by their session even if they also happen
 * to carry an old guest cookie — the session is the stronger claim, and letting the cookie
 * win would let a shared browser attach one person's chat to another's account.
 */
export async function getSupportCaller(): Promise<SupportCaller> {
    const { user } = await getSession();
    const cookieStore = await cookies();
    const guestToken = cookieStore.get(SUPPORT_COOKIE)?.value ?? null;

    return {
        userId: user?.id ?? null,
        guestToken: user ? null : guestToken,
    };
}

/**
 * The caller's conversation, or null if they have none.
 *
 * A resolved conversation is still returned: the guest should be able to read back what
 * was said, and reopening it is a separate decision made by `openConversation`.
 */
export async function findConversation(caller: SupportCaller): Promise<SupportConversation | null> {
    const sql = getSqlAdmin();

    if (caller.userId) {
        const rows = await sql.unsafe<SupportConversation[]>(
            `SELECT ${COLUMNS} FROM support_conversations
             WHERE user_id = $1
             ORDER BY last_message_at DESC
             LIMIT 1`,
            [caller.userId],
        );
        return rows[0] ?? null;
    }

    if (caller.guestToken) {
        const rows = await sql.unsafe<SupportConversation[]>(
            `SELECT ${COLUMNS} FROM support_conversations WHERE guest_token_hash = $1 LIMIT 1`,
            [hashGuestToken(caller.guestToken)],
        );
        return rows[0] ?? null;
    }

    return null;
}

export interface OpenConversationInput {
    caller: SupportCaller;
    locale?: unknown;
}

export interface OpenConversationResult {
    conversation: SupportConversation;
    /**
     * Set only when a conversation was created for a guest. The caller must put it in the
     * `cg-support` cookie — it is not stored anywhere it can be recovered from later.
     */
    issuedGuestToken: string | null;
    created: boolean;
}

/**
 * Open the caller's conversation, or resume the one they already have.
 *
 * Resuming a resolved conversation reopens it rather than starting a fresh one, so the
 * agent who picks it up sees what was already said instead of answering a question that
 * looks like it arrived without context.
 *
 * Either way the conversation ends up Waiting. Per ADR-0031 there is no assistant to open
 * against and none to hand a reopened chat back to, so `ai_active` is not a state anything
 * writes any more — new rows take the `waiting_human` DEFAULT, and a reopen names it.
 */
export async function openConversation(input: OpenConversationInput): Promise<OpenConversationResult> {
    const sql = getSqlAdmin();
    const existing = await findConversation(input.caller);

    if (existing) {
        if (existing.status !== 'resolved') {
            return { conversation: existing, issuedGuestToken: null, created: false };
        }
        const rows = await sql.unsafe<SupportConversation[]>(
            // `waiting_notified_at` goes back to NULL with the assignment: this is a new
            // waiting spell and nobody has been told about it. Leaving the old mark would
            // mean a customer answered in March and back in June queues in silence,
            // because a ring three months ago still counts as somebody having been told.
            `UPDATE support_conversations
                SET status = 'waiting_human',
                    assigned_admin_id = NULL,
                    waiting_notified_at = NULL,
                    last_message_at = now()
              WHERE id = $1
          RETURNING ${COLUMNS}`,
            [existing.id],
        );
        // Back to Unassigned, recorded — the admin decides who has it next (ADR-0041).
        // Imported here because assignment.ts imports this module.
        const { recordReopened } = await import('./assignment');
        await recordReopened(existing.id, existing.assignedAdminId ?? null);
        return {
            conversation: rows[0],
            issuedGuestToken: null,
            created: false,
        };
    }

    const locale = normaliseLocale(input.locale);
    const brand = currentBrand();

    if (input.caller.userId) {
        const rows = await sql.unsafe<SupportConversation[]>(
            `INSERT INTO support_conversations (user_id, source_brand, locale)
             VALUES ($1, $2, $3)
          RETURNING ${COLUMNS}`,
            [input.caller.userId, brand, locale],
        );
        return {
            conversation: rows[0],
            issuedGuestToken: null,
            created: true,
        };
    }

    // No account, no conversation.
    //
    // ADR-0032 decided this and the data migration acted on it — every guest conversation
    // was resolved with a notice telling them to sign in — but the code that *creates* one
    // was left open, so a signed-out caller could still mint a guest token and start
    // typing. The guarantee the ADR exists for is that every Support Chat has a way to
    // reach whoever started it: a Support Chat is answered inside the app, and `notify.ts`
    // is a doorbell to the team rather than mail to the customer, so a guest who closes the
    // tab is someone an Agent is answering into a void.
    //
    // Thrown rather than returned so no caller can treat it as an ordinary empty result.
    // The guest *read* paths stay open on purpose: a returning guest can still see their
    // transcript and the notice that tells them how to come back.
    throw new SupportValidationError('Sign in to start a Support Chat.');
}

/** Longest name and email accepted, so a form post cannot write an essay into the row. */
const MAX_GUEST_NAME = 120;
const MAX_GUEST_EMAIL = 254; // RFC 5321's ceiling on a forward path.

export function isSupportEmail(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return trimmed.length <= MAX_GUEST_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * Record how to reach a guest, which is what makes their conversation answerable.
 *
 * Called at Escalation and nowhere else. Storing these does not change what the guest may
 * see: the model still reads bookings only from a session, because an address nobody
 * verified proves nothing (ADR-0029).
 */
export async function setGuestIdentity(
    conversationId: string,
    name: unknown,
    email: unknown,
): Promise<SupportConversation | null> {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) throw new SupportValidationError('Name is required.');
    if (trimmedName.length > MAX_GUEST_NAME) {
        throw new SupportValidationError(`Name cannot be longer than ${MAX_GUEST_NAME} characters.`);
    }
    if (!isSupportEmail(email)) {
        throw new SupportValidationError('A valid email is required.');
    }

    const sql = getSqlAdmin();
    const rows = await sql.unsafe<SupportConversation[]>(
        `UPDATE support_conversations
            SET guest_name = $2, guest_email = $3
          WHERE id = $1 AND user_id IS NULL
      RETURNING ${COLUMNS}`,
        [conversationId, trimmedName, (email as string).trim().toLowerCase()],
    );
    return rows[0] ?? null;
}

/**
 * Does this conversation still need contact details before it can join the queue?
 *
 * Mirrors `support_conversations_queued_is_answerable_check`. The constraint is the
 * guarantee; this is how a route asks the question before hitting it.
 */
export function needsGuestIdentity(conversation: SupportConversation): boolean {
    if (conversation.userId) return false;
    return !conversation.guestName || !conversation.guestEmail;
}

/**
 * Move a conversation into the human queue. Returns null if it was already there.
 *
 * `reason` is the model's own account of why it gave up, kept for the Agent who picks the
 * conversation up. It is never rendered to the customer — `toPublicConversation` does not
 * carry it, and it must stay that way: it is a private note about someone, which may be
 * blunt and may be wrong.
 */
export async function requestHuman(
    conversationId: string,
    reason?: string,
): Promise<SupportConversation | null> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<SupportConversation[]>(
        `UPDATE support_conversations
            SET status = 'waiting_human',
                escalation_reason = COALESCE($2, escalation_reason)
          WHERE id = $1 AND status IN ('ai_active', 'resolved')
      RETURNING ${COLUMNS}`,
        [conversationId, reason ?? null],
    );
    return rows[0] ?? null;
}

/**
 * What the widget is told about its own conversation.
 *
 * Deliberately not the whole row: `guest_token_hash` never leaves the server, and which
 * agent is assigned is nobody's business on the customer side.
 */
export function toPublicConversation(conversation: SupportConversation) {
    return {
        id: conversation.id,
        status: conversation.status,
        locale: conversation.locale,
        guestName: conversation.guestName,
        // Safe to send, and the only reason it exists: the reference names this conversation
        // and grants nothing, so the customer can cite it anywhere without it being a way in
        // (ADR-0038). This is the deliberate break from helpdesks whose number *is* the key.
        reference: conversation.reference,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt,
        // So the widget knows whether asking for a person will need a form first, rather
        // than discovering it from a rejected request.
        escalationNeedsDetails: needsGuestIdentity(conversation),
        // Same reasoning for the paperclip: an environment with no bucket configured - a
        // developer's laptop, a preview deployment - should not offer a control whose only
        // possible outcome is a 503.
        attachmentsEnabled: attachmentsConfigured(),
    };
}

/**
 * The key this caller's rate limit counts against.
 *
 * A guest token is not a user id, but it names one browser as reliably as one — which is
 * exactly what the limiter wants, and it is why a returning guest is never thrown into the
 * anonymous bucket. Prefixed so it can never collide with a real user id, and truncated
 * because the limiter only needs a stable key, not the credential itself.
 */
export function rateLimitIdentity(caller: SupportCaller): string | undefined {
    if (caller.userId) return caller.userId;
    if (caller.guestToken) return `guest:${hashGuestToken(caller.guestToken).slice(0, 32)}`;
    return undefined;
}

export class SupportValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SupportValidationError';
    }
}
