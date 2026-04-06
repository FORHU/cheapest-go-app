-- Add banned_at column to profiles for soft-delete (ban) functionality.
-- NULL = not banned, timestamp = when the user was banned.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ DEFAULT NULL;

-- Index for quickly filtering banned users
CREATE INDEX IF NOT EXISTS idx_profiles_banned_at ON profiles(banned_at) WHERE banned_at IS NOT NULL;
