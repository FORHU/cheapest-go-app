-- Migration: 20260601000001_fix_booking_sessions_rls.sql
-- Fix: booking_sessions UPDATE policy lacked WITH CHECK, allowing any authenticated
-- user to set status = 'booked' directly via the Supabase client, bypassing payment.
--
-- All non-pending status transitions (payment_initiated, payment_authorized,
-- processing, booked, expired) are performed server-side using the service role key,
-- which bypasses RLS entirely. Regular users must never be able to advance status.

-- Drop the permissive policy
DROP POLICY IF EXISTS "Users can update own booking sessions" ON booking_sessions;

-- Replacement: users may only update their own sessions AND may only write status = 'pending'.
-- This blocks spoofing completed payment states while still allowing client-side
-- session setup (e.g. updating passenger/contact fields before payment starts).
CREATE POLICY "Users can update own booking sessions"
    ON booking_sessions FOR UPDATE
    USING  (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND status = 'pending'
    );
