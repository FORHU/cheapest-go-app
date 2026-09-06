-- migrate:up
-- Which notice a system message is, so it can be read in the reader's own language.
--
-- `system` rows are the app narrating a Support Chat — a handover, a hitch, the assistant
-- bowing out. They were written in English at the moment they happened, which is wrong in
-- two directions at once: a Korean customer on GeomeeGo (locked to Korean, see ADR-0005)
-- read English, and had the row been written in Korean instead, the English-speaking Agent
-- opening the inbox would read Korean. A stored sentence can only ever be right for one of
-- the two people who read it.
--
-- So the row stores which notice it is and each reader renders it from their own locale
-- files. There are six of them and they are ours, not user text — a translation service
-- would be a per-message cost and a new way for the responder to fail, to re-derive
-- strings we already know.
--
-- `body` is kept and still written in English. It is the fallback when a client has no
-- string for a code it does not recognise, and it is what anyone reading the table or an
-- export sees without having to resolve keys by hand.

ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS notice_code text;

-- text + CHECK rather than a native enum: this vocabulary grows every time the responder
-- learns a new thing to say, and swapping a CHECK is cheaper than recreating a type.
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_notice_code_check;

ALTER TABLE public.support_messages
    ADD CONSTRAINT support_messages_notice_code_check
    CHECK (notice_code IS NULL OR notice_code = ANY (ARRAY[
        'budget_spent',
        'model_declined',
        'asked_for_person',
        'asked_for_person_out_of_hours',
        'assistant_unavailable',
        'model_failed',
        'details_needed'
    ]));

-- Only a system row narrates. A code on a guest, ai or agent message would mean their
-- words get replaced by ours when rendered.
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_notice_is_system_check;

ALTER TABLE public.support_messages
    ADD CONSTRAINT support_messages_notice_is_system_check
    CHECK (notice_code IS NULL OR sender_type = 'system');

-- migrate:down
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_notice_is_system_check;
ALTER TABLE public.support_messages
    DROP CONSTRAINT IF EXISTS support_messages_notice_code_check;
ALTER TABLE public.support_messages
    DROP COLUMN IF EXISTS notice_code;
