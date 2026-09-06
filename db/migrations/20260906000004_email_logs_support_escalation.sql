-- migrate:up
-- Record that the team was told a customer is waiting.
--
-- Every other email the app sends leaves a row in email_logs; the escalation notice should
-- too, and for a sharper reason than consistency. When a customer says nobody answered
-- them for six hours, the first question is whether anyone was ever told — and without a
-- row that question has no answer, only a log line that has since rotated away.
--
-- `booking_id` stays null: a Support Chat is not attached to a booking, and the conversation
-- id goes in `metadata` instead. Nothing enforces uniqueness on (booking_id, email_type),
-- so repeated escalations on different conversations each get their own row.

ALTER TABLE public.email_logs
    DROP CONSTRAINT IF EXISTS email_logs_email_type_check;

ALTER TABLE public.email_logs
    ADD CONSTRAINT email_logs_email_type_check
    CHECK (email_type = ANY (ARRAY[
        'confirmation',
        'ticketed',
        'refund',
        'cancellation',
        'awaiting_ticket',
        'price_alert',
        'support_escalation'
    ]));

-- migrate:down
ALTER TABLE public.email_logs
    DROP CONSTRAINT IF EXISTS email_logs_email_type_check;

ALTER TABLE public.email_logs
    ADD CONSTRAINT email_logs_email_type_check
    CHECK (email_type = ANY (ARRAY[
        'confirmation',
        'ticketed',
        'refund',
        'cancellation',
        'awaiting_ticket',
        'price_alert'
    ]));
