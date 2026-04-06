-- Migration: 20260311000001_create_email_logs.sql
-- Description: Table to track all outbound emails for audit and retry purposes

CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL, -- Relaxed FK to support multiple booking tables
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    email_type TEXT NOT NULL CHECK (email_type IN ('confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_email_logs_booking_id ON email_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);

-- RLS: Admin only
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Email logs are readable by admins" ON email_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    ));

-- Note: No update/delete policy for now to keep logs immutable (except for status updates via service role)
