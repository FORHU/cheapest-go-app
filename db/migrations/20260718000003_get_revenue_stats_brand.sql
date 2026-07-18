-- migrate:up
-- Add optional p_brand param so each brand's admin sees only its own revenue.
-- CheapestGo also captures legacy rows where source_brand IS NULL.
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

-- migrate:down
-- Restore the original single-param version
CREATE OR REPLACE FUNCTION public.get_revenue_stats(php_rate numeric DEFAULT 55.556) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'totalRevenue', COALESCE(SUM(CASE WHEN currency = 'USD' THEN total_price * php_rate ELSE total_price END), 0),
        'confirmedCount', COUNT(*),
        'totalMarkup', COALESCE(SUM(CASE WHEN currency = 'USD' THEN markup_amount * php_rate ELSE markup_amount END), 0),
        'totalProfit', COALESCE(SUM(CASE WHEN currency = 'USD' THEN profit * php_rate ELSE profit END), 0),
        'dailyRevenue', COALESCE(SUM(CASE WHEN created_at::date = CURRENT_DATE AND currency = 'USD' THEN total_price * php_rate WHEN created_at::date = CURRENT_DATE THEN total_price ELSE 0 END), 0),
        'monthlyRevenue', COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) AND currency = 'USD' THEN total_price * php_rate WHEN created_at >= DATE_TRUNC('month', NOW()) THEN total_price ELSE 0 END), 0),
        'revenueByCurrency', (SELECT json_object_agg(currency, total) FROM (SELECT currency, SUM(total_price) AS total FROM (SELECT currency, total_price FROM unified_bookings WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked') UNION ALL SELECT currency, total_price FROM bookings WHERE status IN ('confirmed','ticketed','awaiting_ticket') UNION ALL SELECT COALESCE(currency,'USD'), COALESCE(charged_price, total_price) FROM flight_bookings WHERE status IN ('booked','ticketed','awaiting_ticket')) all_bookings GROUP BY currency) grouped)
    ) INTO result
    FROM (
        SELECT total_price, COALESCE(markup_amount, 0) AS markup_amount, COALESCE(profit, 0) AS profit, COALESCE(currency, 'PHP') AS currency, created_at FROM unified_bookings WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked')
        UNION ALL
        SELECT total_price, 0, 0, COALESCE(currency,'USD'), created_at FROM bookings WHERE status IN ('confirmed','ticketed','awaiting_ticket')
        UNION ALL
        SELECT COALESCE(charged_price, total_price), COALESCE(charged_price, total_price) - COALESCE(supplier_cost, total_price), 0, COALESCE(currency,'USD'), created_at FROM flight_bookings WHERE status IN ('booked','ticketed','awaiting_ticket')
    ) combined;
    RETURN result;
END;
$$;
