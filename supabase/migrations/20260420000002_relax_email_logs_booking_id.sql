-- Migration: 20260420000002_relax_email_logs_booking_id.sql
-- Description: Make booking_id nullable in email_logs to support non-booking emails like price alerts.

ALTER TABLE email_logs ALTER COLUMN booking_id DROP NOT NULL;

-- Update constraints to include price_alert
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE email_logs ADD CONSTRAINT email_logs_email_type_check 
    CHECK (email_type IN ('confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert'));
