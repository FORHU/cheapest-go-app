-- Admin Settings key-value store.
-- Used by the admin dashboard settings page.

CREATE TABLE IF NOT EXISTS admin_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL DEFAULT '""'::jsonb,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Service role has full access (settings are admin-only, accessed via createAdminClient)
CREATE POLICY "Service role full access" ON admin_settings FOR ALL USING (true);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_admin_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admin_settings_updated_at
    BEFORE UPDATE ON admin_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_settings_updated_at();

-- Seed defaults
INSERT INTO admin_settings (key, value) VALUES
    ('portal_name', '"TravelBooking Korean"'),
    ('admin_email', '"admin@travelbooking.kr"'),
    ('platform_description', '"Universal booking platform for premium travel services."'),
    ('public_registration', 'true'),
    ('default_currency', '"USD"'),
    ('timezone', '"Asia/Manila"'),
    ('cache_duration', '60')
ON CONFLICT (key) DO NOTHING;
