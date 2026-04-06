-- Migration: 20260310000000_relax_refund_logs_fk.sql
-- Description: Relax foreign key on refund_logs.booking_id to allow referencing unified_bookings and flight_bookings.

-- 1. Remove the existing strict foreign key to legacy bookings table
ALTER TABLE refund_logs 
DROP CONSTRAINT IF EXISTS refund_logs_booking_id_fkey;

-- [Note] We could add a new polymorphic-style trigger or check constraint later, 
-- but for now, relaxing the FK allows the admin dashboard to record logs for all booking types.
