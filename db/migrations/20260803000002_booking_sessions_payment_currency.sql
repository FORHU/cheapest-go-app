-- booking_sessions.payment_currency was written by /api/flights/book but never existed.
--
-- Postgres rejects the whole statement when one column is unknown, so the audit
-- UPDATE that also carries currency, original_price, charged_price and markup_pct
-- failed in its entirety on every booking. The route only warned, so those four
-- fields have silently never been persisted.
ALTER TABLE booking_sessions
    ADD COLUMN IF NOT EXISTS payment_currency TEXT;

COMMENT ON COLUMN booking_sessions.payment_currency IS
    'ISO currency the customer was actually charged in (may differ from the offer currency).';
