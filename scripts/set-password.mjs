import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const email = process.argv[2] || 'clydeantonio.work@gmail.com';
const password = process.argv[3] || 'Admin1234!';

const sql = postgres('postgresql://cheapestgo:cheapestgo@localhost:5433/cheapestgo?sslmode=disable');

const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
});

const result = await sql`
    UPDATE users SET password_hash = ${passwordHash}, role = 'admin'
    WHERE email = ${email.toLowerCase()}
    RETURNING id, email, role
`;

if (result.length === 0) {
    console.log('No user found for', email);
} else {
    console.log('Password set and role=admin for:', result[0].email);
    console.log('Login with:', email, '/', password);
}

await sql.end();
