-- migrate:up

-- A Support Chat gains a name, the trips it is about, and somewhere for Agents to write
-- to each other. See ADR-0038 (the reference names but opens nothing) and ADR-0039 (the
-- queue is ordered by how close the customer is to travelling).

-- ── The Chat Reference ────────────────────────────────────────────────────────────────
--
-- Crockford base32, the same alphabet mintBookingReference already uses: no I, L, O or U,
-- so nothing is misheard as 1 or 0 or read as a word. The prefix is CS- and not CG-/GG-
-- because `isBookingReference()` guards the Stripe metadata path in booking/confirm and
-- would otherwise accept a conversation as a sale — and because a customer saying "about
-- CG-7K2M9Q" would be naming either one.
--
-- Minted by the column default rather than by the application. A reference is the only way
-- to cite a conversation, so a row that reaches the table without one is a conversation
-- nobody can point at; a default means no insert path can forget, including one written
-- later by someone who has not read this.
CREATE OR REPLACE FUNCTION public.mint_chat_reference() RETURNS text
    LANGUAGE sql VOLATILE AS $$
    SELECT 'CS-' || string_agg(
        substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1), ''
    )
    FROM generate_series(1, 6);
$$;

ALTER TABLE public.support_conversations
    ADD COLUMN IF NOT EXISTS reference text;

-- Existing rows first, so the NOT NULL below has something to hold. random() is volatile,
-- so each row gets its own value.
UPDATE public.support_conversations
   SET reference = public.mint_chat_reference()
 WHERE reference IS NULL;

ALTER TABLE public.support_conversations
    ALTER COLUMN reference SET DEFAULT public.mint_chat_reference();
ALTER TABLE public.support_conversations
    ALTER COLUMN reference SET NOT NULL;

-- 32^6 is about 1.07e9, which is ample and not collision-proof. The index is what makes it
-- safe; callers retry on a unique violation exactly as mintUniqueBookingReference does.
CREATE UNIQUE INDEX IF NOT EXISTS support_conversations_reference_key
    ON public.support_conversations (reference);

-- ── The Agent's override of computed Urgency ──────────────────────────────────────────
--
-- Urgency itself has no column and never will (ADR-0039): it is read from the linked
-- booking's dates at query time, because a trip three weeks away when the chat opened is
-- three days away later and a stored value would be quietly wrong by then. What is stored
-- is only an Agent overruling it. NULL means "use the computed value", which is why there
-- is no DEFAULT 'normal' here — 'normal' would be a judgement nobody made.
ALTER TABLE public.support_conversations
    ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE public.support_conversations
    DROP CONSTRAINT IF EXISTS support_conversations_priority_check;
ALTER TABLE public.support_conversations
    ADD CONSTRAINT support_conversations_priority_check
    CHECK (priority IS NULL OR priority = ANY (ARRAY['low', 'normal', 'high', 'critical']));

-- ── Linked Bookings ───────────────────────────────────────────────────────────────────
--
-- Many, not one. A customer has at most one open Support Chat, so the single chat that is
-- open carries every question they have — and a trip is often a flight and a hotel bought
-- separately. Zero is also normal: "how do refunds work" is about no trip in particular.
--
-- Keyed by booking_reference rather than by a foreign key, because the reference is the one
-- identifier `bookings` and `flight_bookings` share and no FK can point at two tables. The
-- reference is also what the customer says out loud.
CREATE TABLE IF NOT EXISTS public.support_conversation_bookings (
    conversation_id   uuid NOT NULL
        REFERENCES public.support_conversations(id) ON DELETE CASCADE,
    booking_reference text NOT NULL,
    -- The Agent who attached it, or NULL when the customer chose it themselves at the
    -- moment they opened the chat. Recorded because the question this answers arrives
    -- during a refund dispute: was this trip named by the person claiming it, or by us?
    linked_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
    linked_at         timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, booking_reference)
);

-- Answers "what has this customer contacted us about for this trip", which is the question
-- an Agent opening a disputed booking actually has.
CREATE INDEX IF NOT EXISTS support_conversation_bookings_reference_idx
    ON public.support_conversation_bookings (booking_reference);

-- ── Internal Notes ────────────────────────────────────────────────────────────────────
--
-- A separate table, not a sender_type on support_messages, and the reason is a leak rather
-- than a taxonomy. `listMessages` has four callers and three of them are customer-facing —
-- including the live SSE stream — so a note living among the messages would have to be
-- filtered out in every one of them, correctly, forever, including by whoever adds the
-- fifth caller. Here the customer's read path cannot return a note because it does not
-- query this table.
--
-- It also keeps the queue still. `appendMessage` bumps `last_message_at` in the same
-- statement as the insert and the Waiting queue sorts on it, so a note written through
-- that path would move a customer's place in the queue because an Agent wrote something
-- about them.
CREATE TABLE IF NOT EXISTS public.support_notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL
        REFERENCES public.support_conversations(id) ON DELETE CASCADE,
    -- Always a person. A note has no other kind of author: nothing automated writes here,
    -- and an unattributed note is one nobody can ask about.
    author_admin_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    body            text NOT NULL,
    created_at      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_notes_conversation_idx
    ON public.support_notes (conversation_id, created_at);

-- migrate:down

DROP INDEX IF EXISTS public.support_notes_conversation_idx;
DROP TABLE IF EXISTS public.support_notes;

DROP INDEX IF EXISTS public.support_conversation_bookings_reference_idx;
DROP TABLE IF EXISTS public.support_conversation_bookings;

ALTER TABLE public.support_conversations
    DROP CONSTRAINT IF EXISTS support_conversations_priority_check;
ALTER TABLE public.support_conversations
    DROP COLUMN IF EXISTS priority;

DROP INDEX IF EXISTS public.support_conversations_reference_key;
ALTER TABLE public.support_conversations
    ALTER COLUMN reference DROP DEFAULT;
ALTER TABLE public.support_conversations
    DROP COLUMN IF EXISTS reference;

DROP FUNCTION IF EXISTS public.mint_chat_reference();
