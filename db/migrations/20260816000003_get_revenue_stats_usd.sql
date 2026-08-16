-- migrate:up
-- Report in USD from each booking's locked rate, not from a runtime php_rate.
-- See docs/adr/0008-fx-locked-at-booking-in-usd.md.
--
-- The previous version summed `CASE WHEN currency = 'USD' THEN total_price * php_rate
-- ELSE total_price END`, which assumes every booking is USD or PHP. Checkout charges
-- in KRW, USD and PHP, so a ₩500,000 booking was added to a peso total as 500,000 —
-- inflating revenue by roughly 24× for that row.
--
-- Naming follows CONTEXT.md: what the platform handles is Gross Booking Value; what it
-- keeps is Net Revenue. The old `totalProfit` is not reported — markup is sized to break
-- even on Stripe fees (src/lib/pricing.ts), so there is no profit figure to show.
--
-- Rows with no locked rate are excluded from the blended totals and counted separately
-- in `unconvertedCount`, so a gap is visible rather than silently understating revenue.

-- The original one-argument version from schema.sql was never dropped when the brand-aware
-- two-argument version was added, so both have coexisted as overloads. Every caller passes
-- both arguments, which is why the ambiguity never surfaced — but a zero-argument call
-- cannot resolve between them. Drop the stale one.
DROP FUNCTION IF EXISTS public.get_revenue_stats(numeric);

CREATE OR REPLACE FUNCTION public.get_revenue_stats(
    php_rate numeric DEFAULT NULL,   -- retained for call compatibility; unused
    p_brand text DEFAULT NULL
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE result JSON;
BEGIN
    WITH combined AS (
        SELECT total_price, COALESCE(markup_amount, 0) AS markup_amount,
               COALESCE(currency, 'PHP') AS currency, created_at,
               usd_amount, fx_rate, fx_source
        FROM unified_bookings
        WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
        UNION ALL
        SELECT total_price, 0, COALESCE(currency,'USD'), created_at,
               usd_amount, fx_rate, fx_source
        FROM bookings
        WHERE status IN ('confirmed','ticketed','awaiting_ticket')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
        UNION ALL
        SELECT COALESCE(charged_price, total_price),
               COALESCE(charged_price, total_price) - COALESCE(supplier_cost, total_price),
               COALESCE(currency,'USD'), created_at,
               usd_amount, fx_rate, fx_source
        FROM flight_bookings
        WHERE status IN ('booked','ticketed','awaiting_ticket')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
    )
    SELECT json_build_object(
        -- Money handled, in USD. Only rows carrying a locked rate contribute.
        'grossBookingValue', COALESCE(SUM(usd_amount), 0),
        -- What we keep: the markup, restated at the same locked rate.
        'netRevenue',        COALESCE(SUM(markup_amount * fx_rate), 0),
        'confirmedCount',    COUNT(*),
        'unconvertedCount',  COUNT(*) FILTER (WHERE usd_amount IS NULL),
        'estimatedCount',    COUNT(*) FILTER (WHERE fx_source = 'estimated'),
        'dailyRevenue',      COALESCE(SUM(usd_amount) FILTER (WHERE created_at::date = CURRENT_DATE), 0),
        'monthlyRevenue',    COALESCE(SUM(usd_amount) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())), 0),
        -- Unconverted, in each booking's own currency. Always correct; never blended.
        'revenueByCurrency', (
            SELECT COALESCE(json_object_agg(currency, total), '{}'::json)
            FROM (SELECT currency, SUM(total_price) AS total FROM combined GROUP BY currency) g
        ),
        -- Back-compat aliases so existing callers keep rendering during rollout.
        'totalRevenue',      COALESCE(SUM(usd_amount), 0),
        'totalMarkup',       COALESCE(SUM(markup_amount * fx_rate), 0),
        'reportingCurrency', 'USD'
    ) INTO result
    FROM combined;
    RETURN result;
END;
$$;

-- migrate:down
CREATE OR REPLACE FUNCTION public.get_revenue_stats(
    php_rate numeric DEFAULT 55.556,
    p_brand text DEFAULT NULL
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'totalRevenue',   COALESCE(SUM(CASE WHEN currency = 'USD' THEN total_price * php_rate ELSE total_price END), 0),
        'confirmedCount', COUNT(*),
        'totalMarkup',    COALESCE(SUM(CASE WHEN currency = 'USD' THEN markup_amount * php_rate ELSE markup_amount END), 0),
        'totalProfit',    COALESCE(SUM(CASE WHEN currency = 'USD' THEN profit * php_rate ELSE profit END), 0),
        'dailyRevenue',   COALESCE(SUM(CASE
            WHEN created_at::date = CURRENT_DATE AND currency = 'USD' THEN total_price * php_rate
            WHEN created_at::date = CURRENT_DATE THEN total_price
            ELSE 0 END), 0),
        'monthlyRevenue', COALESCE(SUM(CASE
            WHEN created_at >= DATE_TRUNC('month', NOW()) AND currency = 'USD' THEN total_price * php_rate
            WHEN created_at >= DATE_TRUNC('month', NOW()) THEN total_price
            ELSE 0 END), 0),
        'revenueByCurrency', (
            SELECT json_object_agg(currency, total)
            FROM (
                SELECT currency, SUM(total_price) AS total
                FROM (
                    SELECT currency, total_price FROM unified_bookings
                    WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked')
                      AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
                    UNION ALL
                    SELECT currency, total_price FROM bookings
                    WHERE status IN ('confirmed','ticketed','awaiting_ticket')
                      AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
                    UNION ALL
                    SELECT COALESCE(currency,'USD'), COALESCE(charged_price, total_price) FROM flight_bookings
                    WHERE status IN ('booked','ticketed','awaiting_ticket')
                      AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
                ) all_bookings
                GROUP BY currency
            ) grouped
        )
    ) INTO result
    FROM (
        SELECT total_price, COALESCE(markup_amount, 0) AS markup_amount, COALESCE(profit, 0) AS profit,
               COALESCE(currency, 'PHP') AS currency, created_at
        FROM unified_bookings
        WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
        UNION ALL
        SELECT total_price, 0, 0, COALESCE(currency,'USD'), created_at
        FROM bookings
        WHERE status IN ('confirmed','ticketed','awaiting_ticket')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
        UNION ALL
        SELECT COALESCE(charged_price, total_price),
               COALESCE(charged_price, total_price) - COALESCE(supplier_cost, total_price),
               0, COALESCE(currency,'USD'), created_at
        FROM flight_bookings
        WHERE status IN ('booked','ticketed','awaiting_ticket')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
    ) combined;
    RETURN result;
END;
$$;
