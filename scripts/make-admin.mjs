import postgres from 'postgres';

const email = process.argv[2] || 'clydeantonio.work@gmail.com';
const sql = postgres('postgresql://cheapestgo:cheapestgo@localhost:5433/cheapestgo?sslmode=disable');

const rows = await sql`SELECT id, email, role FROM users WHERE email = ${email.toLowerCase()}`;

if (rows.length === 0) {
    console.log(`No user found for ${email}`);
} else {
    const user = rows[0];
    console.log('Found:', user.id, user.email, 'current role:', user.role);
    if (user.role !== 'admin') {
        await sql`UPDATE users SET role = 'admin' WHERE id = ${user.id}`;
        console.log('Role updated to admin.');
    } else {
        console.log('Already admin.');
    }
}

await sql.end();
