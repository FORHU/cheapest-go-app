-- migrate:up

-- Every change to whose a Support Chat is, and every resolution, as it happens.
--
-- Assignment is now given by an admin and never taken (CONTEXT.md, "Assignment"), because
-- Support Agents are paid by the chats they handle. `support_conversations.assigned_admin_id`
-- says who holds a chat *now*; it is overwritten by every reassignment and cleared when a
-- chat is given back or reopened, so it cannot say who handled what last month. This can.
-- A chat is **Handled** by the Support Agent it was assigned to at the moment it was resolved
-- — which is recorded here at that moment, because afterwards is too late to ask.
--
--   assigned   an admin gave it to `to_admin_id` (from `from_admin_id`, if it was someone's)
--   returned   the Support Agent `from_admin_id` gave it back to Unassigned
--   reopened   the customer wrote after it was resolved; it returned to Unassigned
--   released   `from_admin_id` stopped being a Support Agent; their chats went back
--   resolved   marked finished; `to_admin_id` is who held it then (NULL if nobody did)
--
-- `actor_admin_id` is who did it — NULL where the customer did (reopened).
CREATE TABLE IF NOT EXISTS public.support_assignment_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
    kind            text NOT NULL
        CHECK (kind = ANY (ARRAY['assigned', 'returned', 'reopened', 'released', 'resolved'])),
    from_admin_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
    to_admin_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
    actor_admin_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    -- An assignment names who it went to; nothing else moves a chat *to* anyone.
    CONSTRAINT support_assignment_events_to_check
        CHECK ((kind = 'assigned') = (to_admin_id IS NOT NULL) OR kind = 'resolved')
);

-- The tally: resolutions per Support Agent over a period.
CREATE INDEX IF NOT EXISTS idx_support_assignment_events_handled
    ON public.support_assignment_events (to_admin_id, created_at)
    WHERE kind = 'resolved';

-- One chat's history, in order.
CREATE INDEX IF NOT EXISTS idx_support_assignment_events_conversation
    ON public.support_assignment_events (conversation_id, created_at);

-- migrate:down

DROP TABLE IF EXISTS public.support_assignment_events;
