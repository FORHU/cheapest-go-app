-- migrate:up
-- Customer support chat: conversations and the messages in them.
--
-- Both vocabularies here are `text` + CHECK rather than native enums. Per the enum
-- convention, a native enum is for a value set that is permanently fixed; these two are
-- expected to grow (an `ai_unavailable` status, an `attachment` sender) and swapping a
-- CHECK is cheaper than recreating a type that columns depend on.
--
-- Two separate things are enforced here rather than left to route code, because both are
-- the kind of rule that a later handler quietly forgets.
--
-- First, every conversation has an owner: a signed-in user, or a guest holding a token in
-- a cookie. "Neither" is the state that would hand a stranger's conversation to whoever
-- asked for it.
--
-- Second, a conversation that has reached the Agent queue is answerable. A guest is not
-- asked for a name and email to start chatting — the model answers without them, and a
-- form standing between a visitor and their question costs more than it returns. They are
-- asked at Escalation, which is the one moment the answer is needed, so the constraint
-- lands on the status rather than on the row's existence. An Agent opening the inbox can
-- always reply to what is in it.

CREATE TABLE IF NOT EXISTS public.support_conversations (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid REFERENCES public.users(id) ON DELETE SET NULL,
    guest_name        text,
    guest_email       text,
    -- sha256 of the cookie value, never the value itself: a dump of this table then
    -- reveals who talked to support, but does not let the reader resume the chat.
    guest_token_hash  text UNIQUE,
    status            text NOT NULL DEFAULT 'ai_active',
    -- Same convention as bookings.source_brand: whichever brand's instance served the
    -- widget. One queue for both, but the column is here from day one so the queues can
    -- be split later without a migration.
    source_brand      text,
    locale            text NOT NULL DEFAULT 'en',
    assigned_admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at        timestamp with time zone NOT NULL DEFAULT now(),
    updated_at        timestamp with time zone NOT NULL DEFAULT now(),
    last_message_at   timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT support_conversations_status_check
        CHECK (status = ANY (ARRAY['ai_active', 'waiting_human', 'human_active', 'resolved'])),

    CONSTRAINT support_conversations_has_owner_check
        CHECK (user_id IS NOT NULL OR guest_token_hash IS NOT NULL),

    CONSTRAINT support_conversations_queued_is_answerable_check
        CHECK (status NOT IN ('waiting_human', 'human_active')
            OR user_id IS NOT NULL
            OR (guest_name IS NOT NULL AND guest_email IS NOT NULL))
);

-- The agent inbox reads the queue oldest-first, so the ordering column is in the index.
CREATE INDEX IF NOT EXISTS idx_support_conversations_queue
    ON public.support_conversations (status, last_message_at)
    WHERE status <> 'resolved';

-- Resuming a signed-in user's open conversation.
CREATE INDEX IF NOT EXISTS idx_support_conversations_user_open
    ON public.support_conversations (user_id, last_message_at DESC)
    WHERE user_id IS NOT NULL AND status <> 'resolved';

CREATE TABLE IF NOT EXISTS public.support_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
    sender_type     text NOT NULL,
    sender_admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    body            text NOT NULL,
    created_at      timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT support_messages_sender_type_check
        CHECK (sender_type = ANY (ARRAY['guest', 'ai', 'agent', 'system'])),

    -- An agent message names the agent. Without this an admin reply can land with no
    -- author, which is exactly the row you need when a customer disputes what was said.
    CONSTRAINT support_messages_agent_is_attributed_check
        CHECK (sender_type <> 'agent' OR sender_admin_id IS NOT NULL)
);

-- Every read of a conversation is "its messages in order", and the SSE backfill asks
-- for them after a cursor.
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
    ON public.support_messages (conversation_id, created_at);

CREATE OR REPLACE FUNCTION public.update_support_conversations_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_support_conversations_updated_at ON public.support_conversations;
CREATE TRIGGER trg_support_conversations_updated_at
    BEFORE UPDATE ON public.support_conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_support_conversations_updated_at();

-- migrate:down
DROP TRIGGER IF EXISTS trg_support_conversations_updated_at ON public.support_conversations;
DROP FUNCTION IF EXISTS public.update_support_conversations_updated_at();
DROP TABLE IF EXISTS public.support_messages;
DROP TABLE IF EXISTS public.support_conversations;
