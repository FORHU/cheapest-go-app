-- migrate:up

-- What an Agent's translated reply says when it is translated back into English — so the
-- Agent can see what the customer actually read.
--
-- Agents write English and cannot read the Korean their reply was turned into. On 2026-09-11
-- "im handsome too" reached a customer as "잘생겼어요." — "(you're) handsome", a compliment
-- to the customer the Agent never meant to pay. It is a real translation, so no guard can
-- refuse it; only a reader who knows both languages could have caught it, and there is none.
-- The back-translation is that reader: translated back, it reads "(You're) handsome.", and
-- the Agent can see the meaning moved and say it again.
--
-- Stored, like the translation itself (ADR-0033), rather than made on each view: it is a
-- record of what the Agent was shown about their own reply, and the engine asked twice does
-- not answer twice the same way.
--
--   NULL   not attempted yet, or not applicable (anything but a translated Agent reply)
--   ''     attempted and could not be made — the engine refused or failed; the forward
--          translation still stands and was delivered
--   text   the reply as the customer read it, in English
ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS back_translated_body text;

-- Only a translated row has anything to translate back.
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_back_translation_check;
ALTER TABLE public.support_messages
    ADD CONSTRAINT support_messages_back_translation_check
    CHECK (back_translated_body IS NULL OR translation_status = 'translated');

-- migrate:down

ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_back_translation_check;
ALTER TABLE public.support_messages DROP COLUMN IF EXISTS back_translated_body;
