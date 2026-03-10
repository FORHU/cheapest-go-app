-- Create flight_deals table
CREATE TABLE IF NOT EXISTS flight_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    subtitle TEXT,
    discount TEXT,
    original_price DECIMAL(10, 2) NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL,
    image TEXT,
    ends_in TEXT,
    tag TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create flight_trending_routes table
CREATE TABLE IF NOT EXISTS flight_trending_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    search_count INTEGER DEFAULT 0,
    price DECIMAL(10, 2),
    currency TEXT DEFAULT 'USD',
    image TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Basic RLS for public read
ALTER TABLE flight_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_trending_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access for flight_deals" ON flight_deals FOR SELECT USING (true);
CREATE POLICY "Allow public read access for flight_trending_routes" ON flight_trending_routes FOR SELECT USING (true);

-- Seed some initial data matching the mock data
INSERT INTO flight_deals (title, subtitle, discount, original_price, sale_price, image, ends_in, tag)
VALUES 
('Tokyo Adventure', 'Round trip + 5 nights', '35% OFF', 2499, 1624, 'https://picsum.photos/seed/tokyo/400/300', '2d 14h', 'Flash Sale'),
('Paris Getaway', 'Round trip + 4 nights', '25% OFF', 1899, 1424, 'https://picsum.photos/seed/paris/400/300', '1d 8h', NULL),
('Bali Paradise', 'Round trip + 7 nights', '40% OFF', 2199, 1319, 'https://picsum.photos/seed/bali/400/300', '3d 2h', 'Best Value'),
('Swiss Alps Escape', 'Round trip + 5 nights', '30% OFF', 3299, 2309, 'https://picsum.photos/seed/swiss/400/300', '4d 6h', NULL);
