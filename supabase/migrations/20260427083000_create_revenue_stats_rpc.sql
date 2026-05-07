-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: create_revenue_stats_rpc
-- Purpose:   Single source of truth for revenue aggregation across all booking
--            tables (unified_bookings, bookings, flight_bookings). Eliminates
--            the 1000-row JS-side limit and the dashboard/revenue page
--            discrepancy caused by different status filters and calculation paths.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_revenue_stats(php_rate NUMERIC DEFAULT 55.556)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(

        -- ── Total Revenue (all time) ─────────────────────────────────────────
        'totalRevenue', COALESCE(SUM(
            CASE
                WHEN currency = 'USD' THEN total_price * php_rate
                ELSE total_price
            END
        ), 0),

        -- ── Confirmed booking count ──────────────────────────────────────────
        'confirmedCount', COUNT(*),

        -- ── Total Markup ─────────────────────────────────────────────────────
        'totalMarkup', COALESCE(SUM(
            CASE
                WHEN currency = 'USD' THEN markup_amount * php_rate
                ELSE markup_amount
            END
        ), 0),

        -- ── Total Profit (after Stripe fees) ─────────────────────────────────
        'totalProfit', COALESCE(SUM(
            CASE
                WHEN currency = 'USD' THEN profit * php_rate
                ELSE profit
            END
        ), 0),

        -- ── Daily Revenue (today only) ───────────────────────────────────────
        'dailyRevenue', COALESCE(SUM(
            CASE
                WHEN created_at::date = CURRENT_DATE AND currency = 'USD' THEN total_price * php_rate
                WHEN created_at::date = CURRENT_DATE THEN total_price
                ELSE 0
            END
        ), 0),

        -- ── Monthly Revenue (current calendar month) ─────────────────────────
        'monthlyRevenue', COALESCE(SUM(
            CASE
                WHEN created_at >= DATE_TRUNC('month', NOW()) AND currency = 'USD' THEN total_price * php_rate
                WHEN created_at >= DATE_TRUNC('month', NOW()) THEN total_price
                ELSE 0
            END
        ), 0),

        -- ── Revenue by currency (for debugging) ──────────────────────────────
        'revenueByCurrency', (
            SELECT json_object_agg(currency, total)
            FROM (
                SELECT currency, SUM(total_price) AS total
                FROM (
                    SELECT currency, total_price FROM unified_bookings
                        WHERE status IN ('confirmed', 'ticketed', 'awaiting_ticket', 'booked')
                    UNION ALL
                    SELECT currency, total_price FROM bookings
                        WHERE status IN ('confirmed', 'ticketed', 'awaiting_ticket')
                    UNION ALL
                    SELECT COALESCE(currency, 'USD'), COALESCE(charged_price, total_price)
                        FROM flight_bookings
                        WHERE status IN ('booked', 'ticketed', 'awaiting_ticket')
                ) all_bookings
                GROUP BY currency
            ) grouped
        )

    ) INTO result
    FROM (
        -- ── Unified bookings (new hotel + flight bookings) ───────────────────
        SELECT
            total_price,
            COALESCE(markup_amount, 0)  AS markup_amount,
            COALESCE(profit, 0)         AS profit,
            COALESCE(currency, 'PHP')   AS currency,
            created_at
        FROM unified_bookings
        WHERE status IN ('confirmed', 'ticketed', 'awaiting_ticket', 'booked')

        UNION ALL

        -- ── Legacy hotel bookings ────────────────────────────────────────────
        SELECT
            total_price,
            0               AS markup_amount,
            0               AS profit,
            COALESCE(currency, 'USD') AS currency,
            created_at
        FROM bookings
        WHERE status IN ('confirmed', 'ticketed', 'awaiting_ticket')

        UNION ALL

        -- ── Legacy flight bookings ───────────────────────────────────────────
        -- Use charged_price (customer-facing) over total_price (supplier cost)
        SELECT
            COALESCE(charged_price, total_price)                                                    AS total_price,
            COALESCE(charged_price, total_price) - COALESCE(supplier_cost, total_price)             AS markup_amount,
            0                                                                                        AS profit,
            COALESCE(currency, 'USD')                                                               AS currency,
            created_at
        FROM flight_bookings
        WHERE status IN ('booked', 'ticketed', 'awaiting_ticket')

    ) combined;

    RETURN result;
END;
$$;

-- Grant access to authenticated users and service role
GRANT EXECUTE ON FUNCTION get_revenue_stats(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION get_revenue_stats(NUMERIC) TO service_role;
