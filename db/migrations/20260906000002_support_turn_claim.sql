-- migrate:up
-- Which conversation a model turn is currently running for, so two do not run at once.
--
-- A customer who sends three messages quickly would otherwise start three turns against
-- the same transcript: three model calls billed, three answers written, and the last two
-- answering a conversation that had already moved on.
--
-- A Postgres advisory lock was the obvious tool and is the wrong one here. Advisory locks
-- belong to a session, and postgres.js pools connections — the lock would be taken on one
-- connection and released on whichever the pool handed back, which is not the same thing.
-- Reserving a connection for the life of a turn would instead hold one of five open across
-- a model call that can take thirty seconds.
--
-- A claim on the row needs no held connection, is visible to every instance through the
-- database they already share, and — because it is a timestamp rather than a flag —
-- expires on its own. A process that dies mid-turn leaves a claim that the next message
-- takes over, rather than a conversation that is silent forever.

ALTER TABLE public.support_conversations
    ADD COLUMN IF NOT EXISTS ai_turn_started_at timestamp with time zone;

-- migrate:down
ALTER TABLE public.support_conversations
    DROP COLUMN IF EXISTS ai_turn_started_at;
