-- migrate:up

-- The stored translation ADR-0033 specified and nothing ever built.
--
-- A support message carries two texts: the words its author wrote, which stay authoritative,
-- and one machine translation stored beside them. A message not written in English gets an
-- English rendering for the inbox; an Agent's English reply gets a rendering in the language
-- the customer writes in. Neither is recomputed on read, because an Agent's reply is a statement made on the
-- basis of a translation, and when a customer later disputes what they were promised the
-- question is what the Agent *read* — which only a stored copy can answer.

ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS translated_body text;

-- The language `translated_body` is in — or, while pending or after a failure, the language
-- it was to be made into. Stored rather than inferred from the conversation, because a
-- conversation's locale can change and a translation cannot: it was made into one language,
-- once, and says so.
--
-- It is also what decides who the translation is for: English is for the inbox, anything
-- else for the customer. That is not the same as "the other party's message" — a Korean-
-- speaking Agent's Korean reply is translated into English for colleagues, and the customer
-- reads the Korean as typed — so it is recorded from the moment translation starts, and the
-- right reader sees "translating…" or "could not translate".
ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS translated_lang text;

-- Where the translation stands, as a fact about this row.
--
--   NULL           nothing to translate: an English conversation, or a system notice (those
--                  render from each reader's own locale files and never need one)
--   'pending'      delivered, translation running — the original is on screen meanwhile
--   'translated'   translated_body holds a rendering and it passed the guard
--   'untranslated' translation was attempted and failed or was refused
--
-- 'untranslated' is not an error state and nothing retries it. CONTEXT.md is explicit that a
-- malfunction never changes a conversation's state: the message was already delivered in its
-- author's words, and the marker is what tells the reader they are looking at the original.
-- It matters more here than it might elsewhere — the translator measured refusing a fifth of
-- distressed customer messages, and a refusal stored as a translation would show a stranded
-- traveller as saying "I'm sorry, I cannot assist with that".
ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS translation_status text;

ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_translation_status_check;
ALTER TABLE public.support_messages
    ADD CONSTRAINT support_messages_translation_status_check
    CHECK (translation_status IS NULL
        OR translation_status = ANY (ARRAY['pending', 'translated', 'untranslated']));

-- A translation must name its language, and only a translated row may carry one. Without
-- this a row could hold text with no way to say what language it is in, or be marked
-- translated with nothing to show.
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_translation_complete_check;
ALTER TABLE public.support_messages
    ADD CONSTRAINT support_messages_translation_complete_check
    CHECK (
        (translation_status = 'translated'
            AND translated_body IS NOT NULL AND translated_lang IS NOT NULL)
        OR (translation_status IS DISTINCT FROM 'translated' AND translated_body IS NULL)
    );

-- migrate:down

ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_translation_complete_check;
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_translation_status_check;
ALTER TABLE public.support_messages DROP COLUMN IF EXISTS translation_status;
ALTER TABLE public.support_messages DROP COLUMN IF EXISTS translated_lang;
ALTER TABLE public.support_messages DROP COLUMN IF EXISTS translated_body;
