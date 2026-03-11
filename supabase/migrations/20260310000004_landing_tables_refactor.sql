-- Refined Landing Page Marketing Data Tables
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Flight Deals
CREATE TABLE IF NOT EXISTS flight_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    currency TEXT DEFAULT 'USD',
    airline TEXT,
    image_url TEXT,
    departure_date DATE,
    return_date DATE,
    discount_tag TEXT, -- "30% OFF", etc.
    ends_in TEXT,      -- "2d 14h", etc.
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Weekend Flight Deals (For LastMinuteWeekendDeals section)
CREATE TABLE IF NOT EXISTS weekend_flight_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- "Seda Ayala Center", etc.
    location TEXT NOT NULL,
    rating DECIMAL(2, 1),
    reviews INTEGER DEFAULT 0,
    original_price DECIMAL(10, 2),
    sale_price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    badge TEXT, -- "Exceptional", "VIP Access"
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Popular Destinations (For ExploreVacationPackages section)
CREATE TABLE IF NOT EXISTS popular_destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    image_url TEXT,
    average_price DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Unique Stays (For ExploreUniqueStays section)
CREATE TABLE IF NOT EXISTS unique_stays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    rating DECIMAL(2, 1),
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    badge TEXT, -- "Unique", "New", etc.
    category TEXT, -- "Tents", "Boats", etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Travel Styles (For StaysForEveryStyle section)
CREATE TABLE IF NOT EXISTS travel_styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    category TEXT, -- "Beach", "Kid-Friendly", etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE flight_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekend_flight_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE popular_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for flight_deals" ON flight_deals FOR SELECT TO anon USING (true);
CREATE POLICY "Public read access for weekend_flight_deals" ON weekend_flight_deals FOR SELECT TO anon USING (true);
CREATE POLICY "Public read access for popular_destinations" ON popular_destinations FOR SELECT TO anon USING (true);
CREATE POLICY "Public read access for unique_stays" ON unique_stays FOR SELECT TO anon USING (true);
CREATE POLICY "Public read access for travel_styles" ON travel_styles FOR SELECT TO anon USING (true);

ALTER TABLE unique_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_styles ENABLE ROW LEVEL SECURITY;

-- Seed Initial Marketing Data
INSERT INTO flight_deals (origin, destination, price, original_price, airline, image_url, departure_date, return_date, discount_tag, ends_in)
VALUES 
('MNL', 'NRT', 1624, 2499, 'Japan Airlines', 'https://picsum.photos/seed/tokyo/400/300', '2026-04-10', '2026-04-15', '35% OFF', '2d 14h'),
('MNL', 'CDG', 1424, 1899, 'Air France', 'https://picsum.photos/seed/paris/400/300', '2026-05-20', '2026-05-24', '25% OFF', '1d 8h'),
('MNL', 'DPS', 1319, 2199, 'AirAsia', 'https://picsum.photos/seed/bali/400/300', '2026-06-01', '2026-06-08', '40% OFF', '3d 2h');

INSERT INTO weekend_flight_deals (name, location, rating, reviews, original_price, sale_price, image_url, badge)
VALUES 
('Seda Ayala Center Cebu', 'Cebu City', 9.2, 2341, 8500, 5990, 'https://picsum.photos/seed/seda/400/300', 'Exceptional'),
('Oakwood Premier Joy~Nostalg', 'Pasig City', 8.8, 1892, 6200, 4340, 'https://picsum.photos/seed/oakwood/400/300', NULL),
('Shangri-La Boracay Resort', 'Boracay Island', 9.6, 3156, 14999, 11250, 'https://picsum.photos/seed/shangri/400/300', 'VIP Access');

INSERT INTO popular_destinations (city, country, image_url, average_price)
VALUES 
('Da Nang', 'Vietnam', 'https://picsum.photos/seed/danang/400/300', 21369),
('Phu Quoc', 'Vietnam', 'https://picsum.photos/seed/phuquoc/400/300', 28700),
('Seoul', 'South Korea', 'https://picsum.photos/seed/seoul/400/300', 32770);

INSERT INTO unique_stays (name, location, rating, price, image_url, badge, category)
VALUES 
('Floating Cottage', 'Batangas', 9.4, 3500, 'https://picsum.photos/seed/floating/400/300', 'Unique', 'Boats'),
('Glamping Dome', 'Tagaytay', 9.1, 4200, 'https://picsum.photos/seed/glamping/400/300', 'New', 'Tents'),
('Tree House Villa', 'Bohol', 9.6, 5800, 'https://picsum.photos/seed/treehouse/400/300', 'Featured', 'Tree House');

INSERT INTO travel_styles (title, location, price, image_url, category)
VALUES 
('Beachfront Villa', 'Boracay, Philippines', 25899, 'https://picsum.photos/seed/villa/400/300', 'Beach'),
('Mountain Retreat', 'Batanes, Philippines', 18499, 'https://picsum.photos/seed/mountain/400/300', 'Ski'),
('City View Suite', 'Makati, Philippines', 32450, 'https://picsum.photos/seed/city/400/300', 'Romantic');
