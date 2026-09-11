-- migrate:up

-- A Support Chat can carry files. See ADR-0040 (an attachment is private and is reached
-- only through the app).
--
-- The thing customers actually send support is a picture: a booking confirmation email, a
-- passport page an airline has queried, a photo of a room that was not what was sold. Until
-- now the only way to hand one over was to email it, which leaves the transcript — the
-- record an Agent reads and a dispute is settled from — missing the evidence it is about.

-- ── Where the bytes are ───────────────────────────────────────────────────────────────
--
-- `storage_key` is the S3 object key and the only pointer to the file. It is built from
-- ids, never from what the customer called the file: a name arrives from a browser and can
-- contain a slash, a NUL, or a leading dot, and a key assembled from one is a key that can
-- point outside its own prefix. The original name is kept in `file_name` for display and
-- for the download's Content-Disposition, where it is data rather than a path.
--
-- No URL column. A stored URL would either be public — see the ADR for why these must not
-- be — or a presigned one that expires, which is a link that works until it silently does
-- not. The route mints a fresh short-lived URL per download instead.
CREATE TABLE IF NOT EXISTS public.support_message_attachments (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id      uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,

    -- Null until the message it belongs to is sent.
    --
    -- A file is uploaded while the customer is still typing, so for a moment it exists and
    -- names no message. Binding it at send time is what makes "attach three files, then
    -- change your mind" leave nothing in the transcript. The orphans that leaves are swept
    -- by `deleteUnboundAttachments`; the bucket's lifecycle rule is the backstop.
    message_id           uuid REFERENCES public.support_messages(id) ON DELETE CASCADE,

    storage_key          text NOT NULL,
    file_name            text NOT NULL,
    content_type         text NOT NULL,
    size_bytes           bigint NOT NULL,

    uploaded_by_type     text NOT NULL,
    uploaded_by_admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at           timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT support_message_attachments_uploader_check
        CHECK (uploaded_by_type = ANY (ARRAY['guest', 'agent'])),

    -- The same rule support_messages holds for agent replies: staff-supplied evidence names
    -- the member of staff. An unattributed file is the one you cannot ask anybody about.
    CONSTRAINT support_message_attachments_agent_is_attributed_check
        CHECK (uploaded_by_type <> 'agent' OR uploaded_by_admin_id IS NOT NULL),

    CONSTRAINT support_message_attachments_size_check
        CHECK (size_bytes > 0)
);

-- One object, one row. Two rows pointing at one key would let deleting either take the
-- other's file away.
CREATE UNIQUE INDEX IF NOT EXISTS support_message_attachments_storage_key_key
    ON public.support_message_attachments (storage_key);

-- Every read is "the attachments on these messages", made while rendering a transcript.
CREATE INDEX IF NOT EXISTS idx_support_message_attachments_message
    ON public.support_message_attachments (message_id);

-- The two reads that are not that: binding at send time, and sweeping orphans, both of
-- which ask a conversation for its unbound rows.
CREATE INDEX IF NOT EXISTS idx_support_message_attachments_unbound
    ON public.support_message_attachments (conversation_id, created_at)
    WHERE message_id IS NULL;

-- migrate:down

DROP TABLE IF EXISTS public.support_message_attachments;
