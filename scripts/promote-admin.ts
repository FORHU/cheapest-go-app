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
        // Find the user by email
        const [profile] = await sql`
            SELECT id, email, role FROM profiles WHERE email = ${email} LIMIT 1
        `;

        if (!profile) {
            console.error(`User not found with email: ${email}`);
            process.exit(1);
        }

        if (profile.role === 'admin') {
            console.log(`${email} is already an admin.`);
            process.exit(0);
        }

        // Update profiles table
        await sql`
            UPDATE profiles SET role = 'admin' WHERE id = ${profile.id}
        `;

        console.log(`Done! ${email} is now an admin.`);
    } catch (err: any) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

promote();
