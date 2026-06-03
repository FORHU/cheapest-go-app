const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

// Load environment variables from .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        env[match[1]] = val;
    }
});

const databaseUrl = env.DATABASE_URL;
const databaseSsl = env.DATABASE_SSL;

if (!databaseUrl) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
}

const sql = postgres(databaseUrl, {
    max: 1,
    ssl: databaseSsl === 'false' ? false : { rejectUnauthorized: false }
});

async function run() {
    try {
        const rows = await sql`
            SELECT city, COUNT(*) as count
            FROM hotel_content
            GROUP BY city
            ORDER BY count DESC
            LIMIT 20
        `;
        console.log('Hotels by city in DB:', rows);
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.end();
    }
}

run();
