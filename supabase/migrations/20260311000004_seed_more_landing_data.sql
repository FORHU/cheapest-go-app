-- ============================================================================
-- Seed additional marketing data for landing page sections.
-- Ensures all sections have 6-8 cards instead of just 3.
-- Also creates unique_stays / travel_styles if they don't exist yet
-- (the refactor migration may have been rolled back by duplicate policy errors).
-- ============================================================================

-- ── Ensure unique_stays and travel_styles tables exist ────────────────────
CREATE TABLE IF NOT EXISTS unique_stays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    rating DECIMAL(2, 1),
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    badge TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS travel_styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (safe to repeat — ENABLE is idempotent)
ALTER TABLE unique_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_styles ENABLE ROW LEVEL SECURITY;

-- Policies (skip if already exist)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unique_stays' AND policyname = 'Public read access for unique_stays') THEN
        CREATE POLICY "Public read access for unique_stays" ON unique_stays FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'travel_styles' AND policyname = 'Public read access for travel_styles') THEN
        CREATE POLICY "Public read access for travel_styles" ON travel_styles FOR SELECT TO anon USING (true);
    END IF;
END $$;

-- ── Seed original data from refactor migration (may have been rolled back) ─
INSERT INTO unique_stays (name, location, rating, price, image_url, badge, category)
SELECT * FROM (VALUES
    ('Floating Cottage', 'Batangas', 9.4::DECIMAL, 3500::DECIMAL, 'https://plus.unsplash.com/premium_photo-1732830163677-db00c1d073d9?w=800&h=600&fit=crop&q=80', 'Unique', 'Boats'),
    ('Glamping Dome', 'Tagaytay', 9.1::DECIMAL, 4200::DECIMAL, 'https://plus.unsplash.com/premium_photo-1718204436844-8593e99ac173?w=800&h=600&fit=crop&q=80', 'New', 'Tents'),
    ('Tree House Villa', 'Bohol', 9.6::DECIMAL, 5800::DECIMAL, 'https://plus.unsplash.com/premium_photo-1697730270201-bdfc5b81a675?w=800&h=600&fit=crop&q=80', 'Featured', 'Tree House')
) AS v(name, location, rating, price, image_url, badge, category)
WHERE NOT EXISTS (SELECT 1 FROM unique_stays WHERE unique_stays.name = v.name);

INSERT INTO travel_styles (title, location, price, image_url, category)
SELECT * FROM (VALUES
    ('Beachfront Villa', 'Boracay, Philippines', 25899::DECIMAL, 'https://images.unsplash.com/photo-1639526473371-e68e5336df56?w=800&h=600&fit=crop&q=80', 'Beach'),
    ('Mountain Retreat', 'Batanes, Philippines', 18499::DECIMAL, 'https://images.unsplash.com/photo-1582625053958-fb011f611c54?w=800&h=600&fit=crop&q=80', 'Ski'),
    ('City View Suite', 'Makati, Philippines', 32450::DECIMAL, 'https://images.unsplash.com/photo-1521367887256-cd1eb3a83057?w=800&h=600&fit=crop&q=80', 'Romantic')
) AS v(title, location, price, image_url, category)
WHERE NOT EXISTS (SELECT 1 FROM travel_styles WHERE travel_styles.title = v.title);

-- ── Flight Deals (6 more → total ~9) ──────────────────────────────────────
INSERT INTO flight_deals (origin, destination, price, original_price, airline, image_url, departure_date, return_date, discount_tag, ends_in)
VALUES
('MNL', 'ICN', 980, 1450, 'Korean Air', 'https://plus.unsplash.com/premium_photo-1754341320142-2c3a54440ff1?w=800&h=600&fit=crop&q=80', '2026-04-18', '2026-04-25', '32% OFF', '4d 6h'),
('MNL', 'BKK', 720, 1100, 'Cebu Pacific', 'https://plus.unsplash.com/premium_photo-1664908495753-db8a434a043c?w=800&h=600&fit=crop&q=80', '2026-05-05', '2026-05-10', '35% OFF', '2d 10h'),
('MNL', 'SIN', 850, 1300, 'Singapore Airlines', 'https://plus.unsplash.com/premium_photo-1697729432930-3f11644e9184?w=800&h=600&fit=crop&q=80', '2026-05-15', '2026-05-19', '35% OFF', '1d 22h'),
('MNL', 'HAN', 640, 950, 'VietJet Air', 'https://plus.unsplash.com/premium_photo-1690960644830-487c569ca6fa?w=800&h=600&fit=crop&q=80', '2026-06-10', '2026-06-15', '33% OFF', '5d 4h'),
('MNL', 'KIX', 1250, 1850, 'Philippine Airlines', 'https://images.unsplash.com/photo-1723983555971-8dafb9ae7265?w=800&h=600&fit=crop&q=80', '2026-04-22', '2026-04-28', '32% OFF', '3d 8h'),
('MNL', 'HKG', 580, 900, 'Cathay Pacific', 'https://plus.unsplash.com/premium_photo-1694475261469-a77647bd1aaa?w=800&h=600&fit=crop&q=80', '2026-05-28', '2026-06-01', '36% OFF', '1d 14h');

-- ── Weekend / Hotel Deals (5 more → total ~8) ─────────────────────────────
INSERT INTO weekend_flight_deals (name, location, rating, reviews, original_price, sale_price, image_url, badge)
VALUES
('The Peninsula Manila', 'Makati', 9.4, 4102, 12500, 8750, 'https://images.unsplash.com/photo-1521367887256-cd1eb3a83057?w=800&h=600&fit=crop&q=80', 'Luxury'),
('Henann Resort Alona Beach', 'Bohol', 8.9, 2876, 7800, 5460, 'https://images.unsplash.com/photo-1594485770508-f629fb05e932?w=800&h=600&fit=crop&q=80', NULL),
('Crimson Resort Mactan', 'Cebu', 9.1, 3420, 11000, 7700, 'https://images.unsplash.com/photo-1751814584924-48c8feb87345?w=800&h=600&fit=crop&q=80', 'Best Seller'),
('Discovery Shores Boracay', 'Boracay Island', 9.5, 2190, 16500, 11550, 'https://images.unsplash.com/photo-1639526473371-e68e5336df56?w=800&h=600&fit=crop&q=80', 'Premium'),
('Plantation Bay Resort', 'Cebu', 8.7, 1854, 9200, 6440, 'https://images.unsplash.com/photo-1701705994021-b21330a838a0?w=800&h=600&fit=crop&q=80', NULL);

-- ── Popular Destinations / Vacation Packages (5 more → total ~8) ──────────
INSERT INTO popular_destinations (city, country, image_url, average_price)
VALUES
('Ho Chi Minh City', 'Vietnam', 'https://images.unsplash.com/photo-1592982349567-c2d4873cfce9?w=800&h=600&fit=crop&q=80', 18500),
('Bangkok', 'Thailand', 'https://plus.unsplash.com/premium_photo-1664908495753-db8a434a043c?w=800&h=600&fit=crop&q=80', 24200),
('Bali', 'Indonesia', 'https://plus.unsplash.com/premium_photo-1673151333226-a3c1bd0109dc?w=800&h=600&fit=crop&q=80', 26800),
('Tokyo', 'Japan', 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=600&fit=crop&q=80', 38500),
('Singapore', 'Singapore', 'https://plus.unsplash.com/premium_photo-1697729432930-3f11644e9184?w=800&h=600&fit=crop&q=80', 29900);

-- ── Unique Stays / Extraordinary Escapes (5 more → total ~8) ──────────────
INSERT INTO unique_stays (name, location, rating, price, image_url, badge, category)
VALUES
('Bamboo Eco Pod', 'Palawan', 9.2, 2800, 'https://images.unsplash.com/photo-1691457798817-aa3d3054016a?w=800&h=600&fit=crop&q=80', 'Eco', 'Tents'),
('Houseboat Escape', 'Subic Bay', 8.8, 4500, 'https://plus.unsplash.com/premium_photo-1754565635657-eb24847b31a3?w=800&h=600&fit=crop&q=80', 'Unique', 'Boats'),
('Canopy Treehouse', 'Bukidnon', 9.3, 3200, 'https://plus.unsplash.com/premium_photo-1711255560433-60dafe53f76d?w=800&h=600&fit=crop&q=80', 'Adventure', 'Tree House'),
('Cliff-side Villa', 'Batanes', 9.7, 8500, 'https://images.unsplash.com/photo-1582625053958-fb011f611c54?w=800&h=600&fit=crop&q=80', 'Exclusive', 'Resorts'),
('Safari Glamping', 'Coron', 9.0, 3800, 'https://images.unsplash.com/photo-1637401637454-dc64f49a38ce?w=800&h=600&fit=crop&q=80', 'New', 'Tents'),
('Lakeside Cabin', 'Laguna', 8.6, 2500, 'https://images.unsplash.com/photo-1690462666233-c710b82d3aef?w=800&h=600&fit=crop&q=80', 'Cozy', 'Tree House'),
('Floating Bungalow', 'Caramoan', 9.4, 5200, 'https://images.unsplash.com/photo-1694672886127-cff2a8b71293?w=800&h=600&fit=crop&q=80', 'Premium', 'Boats'),
('Mountain Resort Pod', 'Sagada', 8.9, 3000, 'https://images.unsplash.com/photo-1563175544-9759b48523b9?w=800&h=600&fit=crop&q=80', 'Scenic', 'Resorts');

-- ── Travel Styles / Curated Collections (5 more → total ~8) ──────────────
INSERT INTO travel_styles (title, location, price, image_url, category)
VALUES
('Waterfront Cottage', 'Siargao, Philippines', 15200, 'https://images.unsplash.com/photo-1622480981421-2f381dcd6e5b?w=800&h=600&fit=crop&q=80', 'Beach'),
('Family Fun Resort', 'Subic, Philippines', 12800, 'https://images.unsplash.com/photo-1628766269121-c8053818a218?w=800&h=600&fit=crop&q=80', 'Kid-Friendly'),
('Highland Retreat', 'Baguio, Philippines', 9800, 'https://images.unsplash.com/photo-1746166741291-638b9d1a2868?w=800&h=600&fit=crop&q=80', 'Ski'),
('Sunset Villa', 'El Nido, Philippines', 28900, 'https://images.unsplash.com/photo-1714707839215-23b307338d1a?w=800&h=600&fit=crop&q=80', 'Romantic'),
('Spa & Wellness Center', 'Tagaytay, Philippines', 14500, 'https://images.unsplash.com/photo-1633670057397-b12fc5289e96?w=800&h=600&fit=crop&q=80', 'Wellness and Relaxation'),
('Tropical Beach House', 'Palawan, Philippines', 19800, 'https://images.unsplash.com/photo-1691457798817-aa3d3054016a?w=800&h=600&fit=crop&q=80', 'Beach'),
('Adventure Camp', 'Cebu, Philippines', 8500, 'https://images.unsplash.com/photo-1755877085014-de6885f1cec2?w=800&h=600&fit=crop&q=80', 'Kid-Friendly'),
('Lakeside Wellness', 'Laguna, Philippines', 11200, 'https://images.unsplash.com/photo-1690462666233-c710b82d3aef?w=800&h=600&fit=crop&q=80', 'Wellness and Relaxation');

-- ── Fix existing rows that were seeded with picsum placeholder URLs ──────
UPDATE flight_deals SET image_url = 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=600&fit=crop&q=80' WHERE destination = 'NRT' AND image_url LIKE '%picsum%';
UPDATE flight_deals SET image_url = 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=600&fit=crop&q=80' WHERE destination = 'CDG' AND image_url LIKE '%picsum%';
UPDATE flight_deals SET image_url = 'https://plus.unsplash.com/premium_photo-1673151333226-a3c1bd0109dc?w=800&h=600&fit=crop&q=80' WHERE destination = 'DPS' AND image_url LIKE '%picsum%';

UPDATE weekend_flight_deals SET image_url = 'https://images.unsplash.com/photo-1701705994021-b21330a838a0?w=800&h=600&fit=crop&q=80' WHERE name = 'Seda Ayala Center Cebu' AND image_url LIKE '%picsum%';
UPDATE weekend_flight_deals SET image_url = 'https://images.unsplash.com/photo-1521367887256-cd1eb3a83057?w=800&h=600&fit=crop&q=80' WHERE name = 'Oakwood Premier Joy~Nostalg' AND image_url LIKE '%picsum%';
UPDATE weekend_flight_deals SET image_url = 'https://images.unsplash.com/photo-1639526473371-e68e5336df56?w=800&h=600&fit=crop&q=80' WHERE name = 'Shangri-La Boracay Resort' AND image_url LIKE '%picsum%';

UPDATE popular_destinations SET image_url = 'https://images.unsplash.com/photo-1741138327956-dfa75763b50d?w=800&h=600&fit=crop&q=80' WHERE city = 'Da Nang' AND image_url LIKE '%picsum%';
UPDATE popular_destinations SET image_url = 'https://plus.unsplash.com/premium_photo-1664365805332-abd4bd4bf295?w=800&h=600&fit=crop&q=80' WHERE city = 'Phu Quoc' AND image_url LIKE '%picsum%';
UPDATE popular_destinations SET image_url = 'https://plus.unsplash.com/premium_photo-1754341320142-2c3a54440ff1?w=800&h=600&fit=crop&q=80' WHERE city = 'Seoul' AND image_url LIKE '%picsum%';
