-- migrate:up
-- A golf booking is priced by the course in its own currency and charged to the customer in a
-- Charge Currency of their choosing (ADR-0051; CONTEXT.md, "Charge Currency", "Supplier Currency").
--
-- Until now both were the same: `currency` was the course's and it was also what the card was
-- charged in. The existing columns keep meaning COURSE currency (what the course is owed), so
-- nothing the course sees changes. The columns added here are the CUSTOMER's side: what was
-- shown and authorised, the rate between the two, and the figures a refund is issued from.
--
--   charge_currency          the currency the card was charged in
--   charge_rate              charge currency per 1 unit of course currency, fixed at the hold
--   charged_*                the booking's parts in the charge currency; they add up exactly
--   usd_amount, fx_*         the payment restated in USD when it was taken (ADR-0008); null
--                            until capture, and only ever written once

ALTER TABLE public.golf_bookings
    ADD COLUMN IF NOT EXISTS charge_currency         char(3),
    ADD COLUMN IF NOT EXISTS charge_rate             numeric(20,10),
    ADD COLUMN IF NOT EXISTS charged_green_fee_total numeric(14,2),
    ADD COLUMN IF NOT EXISTS charged_extras_total    numeric(14,2),
    ADD COLUMN IF NOT EXISTS charged_service_fee     numeric(14,2),
    ADD COLUMN IF NOT EXISTS charged_total           numeric(14,2),
    ADD COLUMN IF NOT EXISTS usd_amount              numeric(14,4),
    ADD COLUMN IF NOT EXISTS fx_rate                 numeric(20,10),
    ADD COLUMN IF NOT EXISTS fx_captured_at          timestamp with time zone,
    ADD COLUMN IF NOT EXISTS fx_source               text;

ALTER TABLE public.golf_booking_extras
    ADD COLUMN IF NOT EXISTS charged_unit_price numeric(14,2),
    ADD COLUMN IF NOT EXISTS charged_total      numeric(14,2);

-- Every booking so far was charged in its course's currency at a rate of 1, so the customer's
-- figures are the ones already there.
UPDATE public.golf_bookings SET
    charge_currency = currency,
    charge_rate = 1,
    charged_green_fee_total = green_fee_total,
    charged_extras_total = extras_total,
    charged_service_fee = service_fee,
    charged_total = total
WHERE charge_currency IS NULL;

UPDATE public.golf_booking_extras SET
    charged_unit_price = unit_price,
    charged_total = total
WHERE charged_total IS NULL;

-- A row inserted without the customer's side was, by definition, charged in the course's currency at
-- a rate of 1 (which is how every booking was made before this). The hold always states them; this
-- is what keeps any other writer from producing a row with the customer's figures missing.
CREATE OR REPLACE FUNCTION public.golf_bookings_charge_defaults() RETURNS trigger AS $$
BEGIN
    NEW.charge_currency := COALESCE(NEW.charge_currency, NEW.currency);
    NEW.charge_rate := COALESCE(NEW.charge_rate, 1);
    NEW.charged_green_fee_total := COALESCE(NEW.charged_green_fee_total, NEW.green_fee_total);
    NEW.charged_extras_total := COALESCE(NEW.charged_extras_total, NEW.extras_total);
    NEW.charged_service_fee := COALESCE(NEW.charged_service_fee, NEW.service_fee);
    NEW.charged_total := COALESCE(NEW.charged_total, NEW.total);
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS golf_bookings_charge_defaults ON public.golf_bookings;
CREATE TRIGGER golf_bookings_charge_defaults BEFORE INSERT ON public.golf_bookings
    FOR EACH ROW EXECUTE FUNCTION public.golf_bookings_charge_defaults();

CREATE OR REPLACE FUNCTION public.golf_booking_extras_charge_defaults() RETURNS trigger AS $$
BEGIN
    NEW.charged_unit_price := COALESCE(NEW.charged_unit_price, NEW.unit_price);
    NEW.charged_total := COALESCE(NEW.charged_total, NEW.total);
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS golf_booking_extras_charge_defaults ON public.golf_booking_extras;
CREATE TRIGGER golf_booking_extras_charge_defaults BEFORE INSERT ON public.golf_booking_extras
    FOR EACH ROW EXECUTE FUNCTION public.golf_booking_extras_charge_defaults();

ALTER TABLE public.golf_bookings
    ALTER COLUMN charge_currency SET NOT NULL,
    ALTER COLUMN charge_rate SET NOT NULL,
    ALTER COLUMN charged_green_fee_total SET NOT NULL,
    ALTER COLUMN charged_extras_total SET NOT NULL,
    ALTER COLUMN charged_service_fee SET NOT NULL,
    ALTER COLUMN charged_total SET NOT NULL;

ALTER TABLE public.golf_booking_extras
    ALTER COLUMN charged_unit_price SET NOT NULL,
    ALTER COLUMN charged_total SET NOT NULL;

COMMENT ON COLUMN public.golf_bookings.fx_rate IS
    'USD per 1 unit of charge_currency, read when the payment was captured. Never recalculated.';

-- migrate:down
DROP TRIGGER IF EXISTS golf_booking_extras_charge_defaults ON public.golf_booking_extras;
DROP FUNCTION IF EXISTS public.golf_booking_extras_charge_defaults();
DROP TRIGGER IF EXISTS golf_bookings_charge_defaults ON public.golf_bookings;
DROP FUNCTION IF EXISTS public.golf_bookings_charge_defaults();

ALTER TABLE public.golf_booking_extras
    DROP COLUMN IF EXISTS charged_unit_price,
    DROP COLUMN IF EXISTS charged_total;

ALTER TABLE public.golf_bookings
    DROP COLUMN IF EXISTS charge_currency,
    DROP COLUMN IF EXISTS charge_rate,
    DROP COLUMN IF EXISTS charged_green_fee_total,
    DROP COLUMN IF EXISTS charged_extras_total,
    DROP COLUMN IF EXISTS charged_service_fee,
    DROP COLUMN IF EXISTS charged_total,
    DROP COLUMN IF EXISTS usd_amount,
    DROP COLUMN IF EXISTS fx_rate,
    DROP COLUMN IF EXISTS fx_captured_at,
    DROP COLUMN IF EXISTS fx_source;
