-- migrate:up
-- The machine rendering of a message, stored beside the words its author wrote.
--
-- Per ADR-0033 a translation is recorded, never recomputed on read. An Agent's reply is a
-- statement made on the basis of a translation, so when a customer later disputes what they
-- were promised the question is "what did the Agent read when they wrote that" — and
-- re-translating cannot answer it. The same input yields different output across model
-- versions, and Chatwonder's /chat is stateful, so two calls on the same day need not agree
-- either. Translate-on-read would answer that question confidently and wrongly.
--
-- One column, not two, because there is one rendering per direction (ADR-0033): a guest row
-- holds its English rendering for the Agent, an agent row holds its rendering in the
-- customer's locale. Which language that is follows from sender_type and the conversation's
-- locale, both of which are already here and neither of which changes after the row is
-- written — so storing the language again would be a second copy of a fact, free to drift.
--
-- NULL is the ordinary case, not an error: an English conversation needs no rendering, and
-- so does a message sent while Chatwonder was unreachable. Every reader has to show the
-- original for those, marked untranslated.

ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS translated_body text;

-- A system row is stored as a notice_code and rendered from each reader's own locale files
-- (see 20260906000001), so it has no rendering of its own to hold. A translation on one
-- would be a second, competing source for words we already ship translated.
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_translation_not_system_check;

ALTER TABLE public.support_messages
    ADD CONSTRAINT support_messages_translation_not_system_check
    CHECK (translated_body IS NULL OR sender_type <> 'system');

-- migrate:down
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_translation_not_system_check;
ALTER TABLE public.support_messages
    DROP COLUMN IF EXISTS translated_body;
