import postgres from 'postgres';
import { verify } from '@node-rs/argon2';

const email = 'clydeantonio.work@gmail.com';
const password = 'Admin1234!';

const sql = postgres('postgresql://cheapestgo:cheapestgo@localhost:5433/cheapestgo?sslmode=disable');

console.log('1. Fetching user...');
const rows = await sql`
    SELECT id, email, password_hash, role, banned_at
    FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
`;
const user = rows[0];
if (!user) { console.error('No user found'); process.exit(1); }
console.log('   Found:', user.id, user.role);

console.log('2. Verifying password...');
const valid = await verify(user.password_hash, password);
console.log('   Valid:', valid);

if (valid) {
    console.log('3. Inserting session...');
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await sql`
        INSERT INTO sessions (id, user_id, expires_at, attributes)
        VALUES (${sessionId}, ${user.id}, ${expiresAt}, ${'{}'}::jsonb)
    `;
    console.log('   Session created:', sessionId);
    // Clean up
    await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
    console.log('   Cleaned up.');
}

await sql.end();
console.log('Done — login flow works end-to-end.');
