-- migrate:up

-- What the widget offered a customer, and what they did with it (ADR-0043).
--
-- A Suggested Answer is never a message: it is a Help Page article shown below the composer
-- while someone types, and the customer decides whether it answered them. None of that belongs
-- in support_messages, which is the record of what people said to each other.
--
-- This table exists to answer the question ADR-0031 left open — whether answering the easy
-- questions without an Agent saves the team anything, or only answers sooner. Per article and
-- per language: how often it was offered, read, said to have solved the problem, or ignored in
-- favour of writing anyway. A card with a high "sent anyway" rate is a card that is matching
-- the wrong questions, and it is meant to be found that way rather than by complaint.
CREATE TABLE IF NOT EXISTS public.support_suggestion_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The chat the customer had open at the time. Null once that chat is deleted, and null is
    -- fine: the counts are about the article, not about one conversation.
    conversation_id uuid REFERENCES public.support_conversations(id) ON DELETE SET NULL,
    -- A key under `help.sections` in the locale files. Text, not an enum: the articles are
    -- edited by adding locale keys, and a vocabulary that grows on a deploy should not need a
    -- type migration to match.
    article_id      text NOT NULL,
    -- The language it was read in, so a card that works in English and fails in Korean is
    -- visible as exactly that rather than as a mediocre average.
    locale          text NOT NULL,
    outcome         text NOT NULL
        CHECK (outcome = ANY (ARRAY['shown', 'opened', 'solved', 'sent_anyway'])),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- The report: how each article performed, in each language, over a period.
CREATE INDEX IF NOT EXISTS idx_support_suggestion_events_article
    ON public.support_suggestion_events (article_id, locale, outcome, created_at);

-- What an Agent opening a chat needs: which articles this customer was already shown.
CREATE INDEX IF NOT EXISTS idx_support_suggestion_events_conversation
    ON public.support_suggestion_events (conversation_id, created_at);

-- migrate:down

DROP TABLE IF EXISTS public.support_suggestion_events;
