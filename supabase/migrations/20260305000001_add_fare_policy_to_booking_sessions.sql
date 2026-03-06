-- ============================================================================
-- Add fare policy columns to booking_sessions
--
-- policy_locked: FALSE at search stage, TRUE after successful revalidation.
--                Payment must be blocked if policy_locked = FALSE.
-- policy_version: 'search' (indicative) | 'revalidated' (locked before payment)
-- ============================================================================

ALTER TABLE booking_sessions
    ADD COLUMN IF NOT EXISTS is_refundable            BOOLEAN,
    ADD COLUMN IF NOT EXISTS is_changeable            BOOLEAN,
    ADD COLUMN IF NOT EXISTS refund_penalty_amount    NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS refund_penalty_currency  TEXT,
    ADD COLUMN IF NOT EXISTS change_penalty_amount    NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS change_penalty_currency  TEXT,
    ADD COLUMN IF NOT EXISTS policy_source            TEXT,
    ADD COLUMN IF NOT EXISTS policy_version           TEXT CHECK (policy_version IN ('search', 'revalidated')),
    ADD COLUMN IF NOT EXISTS policy_locked            BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN booking_sessions.policy_locked IS
    'TRUE after revalidation confirms policy. Payment must be blocked until TRUE.';
COMMENT ON COLUMN booking_sessions.policy_version IS
    '''search'' = indicative, ''revalidated'' = locked pre-payment.';
