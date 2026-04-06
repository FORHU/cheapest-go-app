-- Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE, -- Null means global/admin notification
    title       TEXT        NOT NULL,
    description TEXT,
    type        TEXT        NOT NULL CHECK (type IN ('booking', 'system', 'alert')),
    read        BOOLEAN     NOT NULL DEFAULT false,
    metadata    JSONB       DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can view all notifications"
    ON notifications FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    ));

CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id OR user_id IS NULL);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

-- Sample Notifications for testing
INSERT INTO notifications (title, description, type, read)
VALUES 
    ('Real-time Data Active', 'The notification system is now connected to the database.', 'system', false),
    ('New Booking Alert', 'A new flight booking was just processed via Mystifly.', 'booking', false),
    ('System Health Check', 'All external APIs are responding within normal latency.', 'system', true);
