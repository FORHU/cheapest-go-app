-- Move operational alert thresholds out of env vars and into admin_settings.
-- Values can now be updated via the Supabase dashboard without a redeploy.

INSERT INTO admin_settings (key, value) VALUES
    ('otv_credit_limit',                 '50000'),
    ('otv_credit_utilization_alert_pct', '0.8'),
    ('otv_deadline_alert_hours',         '48'),
    ('duffel_balance_alert_threshold',   '500')
ON CONFLICT (key) DO NOTHING;
