-- migrate:up
-- A Support Chat is Waiting for a person from birth, and the conversations that were
-- mid-assistant when that became true are settled one way or the other.
--
-- ADR-0031 retires the model: every chat is answered by an Agent from its first message.
-- `ai_active` was the DEFAULT on this column, and it named the one thing that no longer
-- happens — a conversation the assistant currently holds. Left as the default, every new
-- row would be born into a state describing a component that does not exist, and the
-- Agent inbox (which reads the queue, not the whole table) would never show it. The
-- DEFAULT moves to `waiting_human`: the conversation joins the queue as it is created,
-- because there is nothing else for it to be waiting on.
--
-- The rows already sitting in `ai_active` were real conversations, and they split in two
-- by whether anyone can be answered.
--
-- A signed-in customer is queued. An Agent can reply and the customer reads that reply in
-- the widget next time they open it, which is the whole of what they were waiting for.
--
-- A guest is closed instead — every guest, including the ones who left a name and email
-- at Escalation. This looks harsher than it is and ADR-0032 records why: `notify.ts` is a
-- doorbell to the team, not a copy of the conversation to the customer, so an Agent's
-- answer only ever lives inside the app. Once the widget requires an account (ADR-0032),
-- a guest cannot get back in to read it. Queueing them would put conversations in front
-- of Agents that they could answer into a void and never finish — so they are resolved,
-- with a system notice saying support is people-only now and that signing in and writing
-- again picks it back up. The transcript survives; the customer has a route back.
--
-- That split is also what keeps `support_conversations_queued_is_answerable_check`
-- satisfied: it refuses `waiting_human` without a reply path, group one has a user_id,
-- and group two never becomes queued.
--
-- `ai_active` deliberately stays in `support_conversations_status_check`. Nothing writes
-- it any more, but conversations really did happen that way and their history says so;
-- ADR-0031 keeps it as residue rather than rewriting the past into a shape it did not
-- have. The guest columns and the answerable check are left alone for the same reason.

ALTER TABLE public.support_conversations
    ALTER COLUMN status SET DEFAULT 'waiting_human';

-- Group one: a signed-in customer joins the Agent queue.
UPDATE public.support_conversations
   SET status = 'waiting_human'
 WHERE status = 'ai_active'
   AND user_id IS NOT NULL;

-- Group two: a guest is closed and told why, in one statement so a conversation cannot be
-- resolved without the notice that explains it. The body is the English fallback from
-- SUPPORT_NOTICE in src/lib/server/support/notices.ts — `notice_code` is the notice, and
-- each reader renders it from their own locale files.
WITH closed AS (
    UPDATE public.support_conversations
       SET status = 'resolved',
           last_message_at = now()
     WHERE status = 'ai_active'
       AND user_id IS NULL
 RETURNING id
)
INSERT INTO public.support_messages (conversation_id, sender_type, body, notice_code)
SELECT id,
       'system',
       'Support has moved to our team and is no longer answered automatically. Sign in and write again and someone will pick it up.',
       'assistant_retired'
  FROM closed;

-- migrate:down
-- Restores the DEFAULT, and undoes group two exactly: the notice row is what identifies
-- those conversations, so deleting it and returning them to `ai_active` puts them back.
--
-- Group one is not reversible and is deliberately not attempted. A signed-in conversation
-- moved to `waiting_human` here is indistinguishable from one a customer escalated on
-- their own, and guessing would send genuinely queued conversations back to an assistant
-- that no longer exists. Rolling this migration down leaves them in the queue, which is
-- the safe direction to be wrong in: an Agent answers a chat that did not need it.
UPDATE public.support_conversations
   SET status = 'ai_active'
 WHERE id IN (
     SELECT conversation_id FROM public.support_messages
      WHERE notice_code = 'assistant_retired'
 );

DELETE FROM public.support_messages
 WHERE notice_code = 'assistant_retired';

ALTER TABLE public.support_conversations
    ALTER COLUMN status SET DEFAULT 'ai_active';
