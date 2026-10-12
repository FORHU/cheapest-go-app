-- migrate:up
-- Course staff (CONTEXT.md, "Course Staff"): people who act for one Golf Course. A role in
-- `users.role` (ADR-0003) says they are course staff; `golf_course_staff` says which courses.
-- They arrive by an emailed invitation or by asking, and an admin approving the request.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY['user'::text, 'admin'::text, 'support_agent'::text, 'course_staff'::text]));

CREATE TABLE IF NOT EXISTS public.golf_course_staff (
    user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_id  uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_golf_course_staff_course ON public.golf_course_staff (course_id);

-- Only a hash of the emailed token is stored, so a read of this table cannot be replayed.
CREATE TABLE IF NOT EXISTS public.golf_course_invitations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id   uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    email       text NOT NULL,
    token_hash  text NOT NULL,
    invited_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
    expires_at  timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    revoked_at  timestamp with time zone,
    created_at  timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_course_invitations_token_key UNIQUE (token_hash),
    CONSTRAINT golf_course_invitations_email_check CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254)
);
CREATE INDEX IF NOT EXISTS idx_golf_course_invitations_course ON public.golf_course_invitations (course_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.golf_course_requests (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status             text NOT NULL DEFAULT 'pending',
    contact_name       text NOT NULL,
    contact_email      text NOT NULL,
    course_name        text NOT NULL,
    country            text NOT NULL,
    city               text NOT NULL,
    -- Set when the requester picked a course that is already listed (a claim).
    existing_course_id uuid REFERENCES public.golf_courses(id) ON DELETE SET NULL,
    message            text NOT NULL DEFAULT '',
    -- The course access was granted for, once approved.
    course_id          uuid REFERENCES public.golf_courses(id) ON DELETE SET NULL,
    decided_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
    decided_at         timestamp with time zone,
    decision_note      text NOT NULL DEFAULT '',
    created_at         timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_course_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT golf_course_requests_message_check CHECK (char_length(message) <= 1000)
);
-- One open request per person: a second one would only be a way to jump the queue.
CREATE UNIQUE INDEX IF NOT EXISTS uq_golf_course_requests_pending
    ON public.golf_course_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_golf_course_requests_status ON public.golf_course_requests (status, created_at);

ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
    'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
    'support_escalation', 'golf_requested', 'golf_confirmed', 'golf_declined', 'golf_cancelled',
    'golf_course_invitation', 'golf_course_request_approved', 'golf_course_request_rejected']));

-- migrate:down
DELETE FROM public.email_logs WHERE email_type LIKE 'golf\_course\_%';
ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
    'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
    'support_escalation', 'golf_requested', 'golf_confirmed', 'golf_declined', 'golf_cancelled']));
DROP TABLE IF EXISTS public.golf_course_requests;
DROP TABLE IF EXISTS public.golf_course_invitations;
DROP TABLE IF EXISTS public.golf_course_staff;
UPDATE public.users SET role = 'user' WHERE role = 'course_staff';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY['user'::text, 'admin'::text, 'support_agent'::text]));
