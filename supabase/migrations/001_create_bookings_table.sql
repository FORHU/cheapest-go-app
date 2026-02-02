-- Drop existing table if it exists (for fresh start)
DROP TABLE IF EXISTS bookings;

-- Create bookings table to store user booking history
CREATE TABLE bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL,

    -- Property info
    property_name TEXT NOT NULL,
    property_image TEXT,
    room_name TEXT NOT NULL,

    -- Booking details
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    guests_adults INTEGER DEFAULT 1,
    guests_children INTEGER DEFAULT 0,

    -- Pricing
    total_price DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'PHP',

    -- Guest info
    holder_first_name TEXT NOT NULL,
    holder_last_name TEXT NOT NULL,
    holder_email TEXT NOT NULL,

    -- Status
    status TEXT DEFAULT 'confirmed',
    special_requests TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);

-- Enable Row Level Security
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own bookings
CREATE POLICY "Users can view own bookings" ON bookings
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own bookings
CREATE POLICY "Users can insert own bookings" ON bookings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own bookings
CREATE POLICY "Users can update own bookings" ON bookings
    FOR UPDATE USING (auth.uid() = user_id);
