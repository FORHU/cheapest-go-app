/**
 * One-time script to promote a user to admin.
 *
 * Usage:
 *   npx tsx scripts/promote-admin.ts your-email@example.com
 *
 * Requires DATABASE_URL in .env
 */

import 'dotenv/config';
import postgres from 'postgres';

const email = process.argv[2];

if (!email) {
    console.error('Usage: npx tsx scripts/promote-admin.ts <email>');
    process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('Missing DATABASE_URL in .env');
    process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function promote() {
    try {
        // users.role is authoritative — profiles.role was dropped in
        // 20260619000001_drop_profiles_role.sql. See docs/adr/0003.
        const [user] = await sql`
            SELECT id, email, role FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
        `;

        if (!user) {
            console.error(`User not found with email: ${email}`);
            process.exit(1);
        }

        if (user.role === 'admin') {
            console.log(`${email} is already an admin.`);
            process.exit(0);
        }

        await sql`
            UPDATE users SET role = 'admin', updated_at = NOW() WHERE id = ${user.id}
        `;

        console.log(`Done! ${email} is now an admin.`);
        console.log('Sign out and back in — the session carries the old role until then.');
    } catch (err: any) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

promote();
