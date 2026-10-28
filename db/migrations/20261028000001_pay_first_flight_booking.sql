-- Pay-first flight booking (docs/superpowers/specs/2026-10-28-pay-first-flight-booking-design.md)

-- 1. A booking attempt's identity. NULL for every session created before this migration.
ALTER TABLE public.booking_sessions ADD COLUMN IF NOT EXISTS quote_hash text;

-- One live attempt per traveller per exact quote. Two submits of the same trip (a double click,
-- or a back-click and resubmit) collide here instead of creating two sessions. 'processing' is
-- included so a booking that is mid-flight cannot be started a second time.
CREATE UNIQUE INDEX IF NOT EXISTS booking_sessions_active_quote_uniq
    ON public.booking_sessions (user_id, quote_hash)
    WHERE quote_hash IS NOT NULL
      AND status IN ('initiated', 'payment_initiated', 'payment_authorized', 'processing');

-- 2. The "we couldn't complete your booking" email.
ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
    'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
    'support_escalation', 'golf_requested', 'golf_confirmed', 'golf_declined', 'golf_cancelled',
    'golf_course_invitation', 'golf_course_request_approved', 'golf_course_request_rejected',
    'golf_course_new_request', 'booking_not_completed'
]));
