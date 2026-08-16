-- migrate:up
-- Hotel checkout had no server-side record of what a room actually costs.
--
-- /api/booking/prebook quoted TravelgateX, returned the price to the browser and
-- forgot it. /api/booking/create-payment then charged whatever `amount` and
-- `currency` the client posted: the price was converted to the user's display
-- currency in the browser (usePricingCalculation) and never re-checked, so the
-- charge depended on client-side FX rates and on the client being honest.
--
-- Flights already have this: the Duffel order total is read back from the provider
-- and used as the Stripe base. This table gives hotels the same trusted anchor.
CREATE TABLE IF NOT EXISTS hotel_prebook_quotes (
    prebook_id      TEXT PRIMARY KEY,
    user_id         UUID,
    -- Supplier-quoted amounts, in the supplier's own currency. Never client-supplied.
    net             NUMERIC(14, 4) NOT NULL,
    gross           NUMERIC(14, 4) NOT NULL,
    currency        TEXT NOT NULL,
    property_name   TEXT,
    room_name       TEXT,
    check_in        DATE,
    check_out       DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- TGX option tokens are short-lived; a quote older than this must not be charged.
    expires_at      TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE hotel_prebook_quotes IS
    'Server-side record of the supplier-quoted hotel price, keyed by prebookId. '
    'create-payment converts and charges from this row, not from the client payload.';

COMMENT ON COLUMN hotel_prebook_quotes.gross IS
    'Supplier total including taxes, in `currency`. This is the Stripe charge base.';

COMMENT ON COLUMN hotel_prebook_quotes.expires_at IS
    'Quotes are not chargeable past this instant — the underlying TGX rate has gone.';

-- create-payment looks up by primary key; this index serves the expiry sweep.
CREATE INDEX IF NOT EXISTS hotel_prebook_quotes_expires_at_idx
    ON hotel_prebook_quotes (expires_at);

-- migrate:down
DROP TABLE IF EXISTS hotel_prebook_quotes;
