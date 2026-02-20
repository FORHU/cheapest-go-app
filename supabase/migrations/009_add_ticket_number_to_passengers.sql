-- ============================================================================
-- Add ticket_number column to passengers for e-ticket storage
-- ============================================================================

ALTER TABLE passengers
    ADD COLUMN IF NOT EXISTS ticket_number TEXT;
