-- migrate:up
-- Why the assistant handed a Support Chat over, for the Agent who picks it up.
--
-- The model already says why when it calls the hand-over function; until now that was read
-- and thrown away. It is the first thing an Agent wants — "refund request" turns a wall of
-- transcript into a conversation you know the shape of before you start reading.
--
-- Deliberately a column and not a message. `system` message bodies are rendered to the
-- customer in the widget, so anything written there is something the customer reads. This
-- is the model's private note about them, which is a different thing: it may be blunt, it
-- may be wrong, and it is never shown to the person it is about.

ALTER TABLE public.support_conversations
    ADD COLUMN IF NOT EXISTS escalation_reason text;

-- migrate:down
ALTER TABLE public.support_conversations
    DROP COLUMN IF EXISTS escalation_reason;
