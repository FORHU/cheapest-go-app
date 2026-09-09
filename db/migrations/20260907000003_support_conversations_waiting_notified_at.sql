-- migrate:up
-- When the team was last told that this conversation is waiting for someone.
--
-- ADR-0031 retires the assistant, and in doing so it moves the doorbell. `notify.ts` used
-- to ring on Escalation — an event, rare, with three named causes, and one that could not
-- happen twice for one conversation because Escalation was one-way. Escalation is gone.
-- Every Support Chat is Waiting from birth, so there is no longer any event to hang the
-- email on, and both of the old callers (the escalate route and the model's turn runner)
-- are being deleted. Without a new trigger nothing whatever would tell the team a customer
-- is waiting, and the first anyone would learn of it is a customer asking why they were
-- ignored.
--
-- The new trigger is the customer's first message into a Waiting, unassigned conversation.
-- Not creation: the widget opens a conversation when the panel opens, so ringing there
-- would mail an empty transcript and then mail again when the question actually arrived.
--
-- "First" is the part that needs a column. A message is not an event that happens once —
-- a customer types three lines and sends three of them, and the count of messages so far
-- is not the question either, because a conversation can wait more than once. Resolved is
-- not an ending: somebody answered weeks ago, an Agent marked it done, and the customer
-- comes back with something new. That is a customer nobody is coming to, exactly as much
-- as the first time, and it has to ring again. So what is recorded is not "has this
-- conversation ever rung" but "has this *waiting spell* rung", and the two reopen paths
-- (`inbox.reopenIfResolved` and the reopen inside `conversations.openConversation`) clear
-- it back to NULL as they queue the conversation again.
--
-- Nullable with no default, and no backfill. NULL means "nobody has been told", which for
-- the rows already sitting in the queue is both true and the useful thing to say: they
-- ring on the next message their customer sends, rather than staying invisible because a
-- backfill claimed they had already been handled. The rows that really were rung for under
-- the old trigger have their record in `email_logs`, which is where the audit lives.
--
-- It is deliberately not cleared on assignment or on resolve. An Agent taking a
-- conversation is the doorbell having worked, not a reason to ring it again; and a
-- resolved conversation is cleared by whichever reopen revives it, at the moment it goes
-- back into the queue, which is the only moment the answer changes.
--
-- A timestamp rather than a boolean, for the same reason `ai_turn_started_at` is one: the
-- question "why did nobody answer this for six hours" is answered by when the team was
-- told, and a flag can only say that they were.

ALTER TABLE public.support_conversations
    ADD COLUMN IF NOT EXISTS waiting_notified_at timestamp with time zone;

-- migrate:down
ALTER TABLE public.support_conversations
    DROP COLUMN IF EXISTS waiting_notified_at;
