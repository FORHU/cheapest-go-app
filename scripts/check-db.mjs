import postgres from 'postgres';

const sql = postgres('postgresql://cheapestgo:cheapestgo@localhost:5433/cheapestgo?sslmode=disable');

// Check key tables exist
const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('users', 'sessions', 'profiles', 'bookings')
    ORDER BY table_name
`;
console.log('Tables found:', tables.map(t => t.table_name));

// Check user password hash
const user = await sql`
    SELECT id, email, role,
           CASE WHEN password_hash IS NULL THEN 'NULL'
                WHEN password_hash = '' THEN 'EMPTY'
                ELSE LEFT(password_hash, 20) || '...' END as hash_preview
    FROM users WHERE email = 'clydeantonio.work@gmail.com'
`;
console.log('User:', user[0] || 'NOT FOUND');

await sql.end();
