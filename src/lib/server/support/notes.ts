/**
 * What Agents write to each other about a Support Chat.
 *
 * A Note has no recipient. It is never delivered, never translated, never shown to the
 * customer, and writing one does not move the customer's place in the queue. It is an
 * annotation on the conversation rather than a message in it, which is why it lives in its
 * own table instead of as a `sender_type` on `support_messages`.
 *
 * That separation is a safety property, not a taxonomy. `listMessages` has four callers and
 * three of them are customer-facing — including the live SSE stream — so a Note among the
 * messages would have to be filtered out in every one of them, correctly, forever, and by
 * whoever adds the fifth. Here the customer's read path cannot return a Note because it
 * does not query this table. The failure mode being avoided is specific: a customer
 * watching an Agent's private assessment of them arrive in real time.
 */

import { getSqlAdmin } from '@/lib/db/postgres';

/** Matches MAX_MESSAGE_LENGTH: a Note is written in the same box and deserves the same room. */
export const MAX_NOTE_LENGTH = 4000;

export interface SupportNote {
    id: string;
    conversationId: string;
    authorAdminId: string;
    body: string;
    createdAt: string;
}

const COLUMNS = `
    id,
    conversation_id  AS "conversationId",
    author_admin_id  AS "authorAdminId",
    body,
    created_at       AS "createdAt"
`;

export interface AddNoteInput {
    conversationId: string;
    /** Always a person. Nothing automated writes a Note, and an unattributed one is one nobody can ask about. */
    authorAdminId: string;
    body: string;
}

/**
 * Write a Note.
 *
 * Deliberately does not touch `last_message_at`. `appendMessage` bumps it in the same
 * statement as the insert and the Waiting queue sorts on it, so routing a Note through
 * that path would push a customer down the queue because an Agent wrote something about
 * them — the conversation would look freshly active to the ordering while being no closer
 * to an answer.
 */
export async function addNote(input: AddNoteInput): Promise<SupportNote> {
    const body = input.body.trim();
    if (!body) throw new Error('A note cannot be empty');
    if (body.length > MAX_NOTE_LENGTH) {
        throw new Error(`A note cannot exceed ${MAX_NOTE_LENGTH} characters`);
    }

    const sql = getSqlAdmin();
    const rows = await sql.unsafe<SupportNote[]>(
        `INSERT INTO support_notes (conversation_id, author_admin_id, body)
         VALUES ($1, $2, $3)
         RETURNING ${COLUMNS}`,
        [input.conversationId, input.authorAdminId, body],
    );
    return rows[0];
}

/** Every Note on one conversation, oldest first, to be merged into the Agent's view by time. */
export async function listNotes(conversationId: string): Promise<SupportNote[]> {
    const sql = getSqlAdmin();
    return sql.unsafe<SupportNote[]>(
        `SELECT ${COLUMNS}
           FROM support_notes
          WHERE conversation_id = $1
          ORDER BY created_at ASC`,
        [conversationId],
    );
}

/**
 * Remove a Note, but only the author's own.
 *
 * Scoped to the author rather than to any Agent because a Note is one person's account of
 * what they thought at the time, and a conversation whose annotations can be tidied by
 * anyone is one whose history cannot be relied on later. Returns whether a row went, so a
 * caller can tell "not yours" from "already gone" — both are a no-op, only one is a mistake.
 */
export async function deleteNote(noteId: string, authorAdminId: string): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<{ id: string }[]>(
        `DELETE FROM support_notes
          WHERE id = $1 AND author_admin_id = $2
          RETURNING id`,
        [noteId, authorAdminId],
    );
    return rows.length > 0;
}
