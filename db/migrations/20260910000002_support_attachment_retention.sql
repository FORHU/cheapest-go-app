-- migrate:up

-- An attachment's bytes do not live as long as the conversation that carries them.
--
-- Two different questions with two different answers, and ADR-0040 left this as its open
-- item. The transcript is a business record — a chargeback is answered from it, and Visa's
-- dispute window runs to about 540 days, so destroying it early destroys our own evidence.
-- A passport page is not that. It proved one thing, once, and after the question it
-- answered is settled it is only liability: something a breach can cost us that is no
-- longer doing any work. The Data Privacy Act's storage-limitation principle says the same
-- thing in fewer words.
--
-- So the bytes go 90 days after the conversation is Resolved, and the row stays.

ALTER TABLE public.support_message_attachments
    ADD COLUMN IF NOT EXISTS bytes_deleted_at timestamp with time zone;

COMMENT ON COLUMN public.support_message_attachments.bytes_deleted_at IS
    'When the object was removed from the bucket under the retention rule. The row survives '
    'so the transcript stays honest: NULL means the file is still fetchable, set means it '
    'was sent and has since expired.';

-- Why the row survives.
--
-- Deleting it outright would make the transcript lie. An Agent writes "thanks for sending
-- your passport" against a message with no attachment on it, and a year later nobody can
-- tell whether the customer never sent one, whether it was removed, or whether something
-- was lost. A tombstone answers that: a file was here, and it expired on this date.
--
-- It also means the size and the file name are still readable, which is what an Agent
-- needs when a customer asks "did you get the document I sent in March".

-- The sweep's working set: sent, still stored, on a conversation resolved long enough ago.
-- Partial so it indexes only the rows the job can act on — once bytes_deleted_at is set a
-- row is finished with and never looked at by the sweep again.
CREATE INDEX IF NOT EXISTS support_message_attachments_retention_idx
    ON public.support_message_attachments (created_at)
    WHERE bytes_deleted_at IS NULL AND message_id IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS public.support_message_attachments_retention_idx;
ALTER TABLE public.support_message_attachments
    DROP COLUMN IF EXISTS bytes_deleted_at;
