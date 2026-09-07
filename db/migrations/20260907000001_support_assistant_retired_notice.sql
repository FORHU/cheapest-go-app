-- migrate:up
-- Adds `assistant_retired` to the notice vocabulary a `support_messages` row can carry.
--
-- ADR-0031 retires the AI from Support Chat: every conversation is now answered by an
-- Agent from its first message. A later migration closes out the conversations that were
-- mid-handoff with the assistant when that happened — guests who never left a name or
-- email, so nobody can reply to them and there is no one left to hand them to. Those
-- threads are closed with a system notice explaining what happened and what to do next,
-- rather than left to sit unanswered forever or silently deleted.
--
-- That notice needs a code of its own: none of the seven that already exist describe it.
-- `budget_spent`, `model_declined` and `model_failed` are the assistant explaining itself
-- mid-conversation and handing over to a person who is about to reply; `asked_for_person`
-- and its out-of-hours sibling are the customer's own request; `assistant_unavailable` is
-- a transient outage the customer can retry past; `details_needed` is still asking for a
-- name and email so a handover can happen at all. `assistant_retired` is different in kind
-- from all seven: there is no handover coming, because the assistant that would have
-- performed it no longer exists. The notice tells the guest support is now people-only and
-- that writing again — signed in this time, so an Agent has someone to reply to — is what
-- picks the conversation back up.
--
-- text + CHECK rather than a native enum, unchanged from 20260906000001: this vocabulary
-- grows every time the responder (or, now, the migration that retires it) learns a new
-- thing to say, and swapping a CHECK is cheaper than recreating a type.
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
        'details_needed',
        'assistant_retired'
    ]));

-- migrate:down
-- Restores the seven-code CHECK from 20260906000001. This is only safe to run down while
-- no row carries 'assistant_retired' yet — the migration that back-fills the closing
-- notice onto abandoned conversations runs after this one, not before it.
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
