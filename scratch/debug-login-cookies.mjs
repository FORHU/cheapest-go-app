/** Does an API login give a session the app recognises? LOCAL :3000.  node scratch/debug-login-cookies.mjs */
import fs from 'fs';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const BASE = 'http://localhost:3000';
const env = fs.readFileSync('.env', 'utf8');
const sql = postgres(env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, ''), { ssl: false, max: 1 });
const email = `bg14-dbg-${Date.now()}@example.test`;
const [u] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                      VALUES (${email}, ${await hash('Smoke-password-1!')}, 'user', 'Bg', 'Dbg') RETURNING id`;
try {
    const r = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: 'Smoke-password-1!' }),
    });
    console.log('login', r.status);
    console.log('set-cookie:', r.headers.getSetCookie().map(c => c.replace(/=([^;]{6})[^;]*/, '=$1…')));
    const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie, 'X-Requested-By': 'cheapestgo-client' } });
    console.log('me', me.status, (await me.text()).slice(0, 100));
} finally {
    await sql`DELETE FROM users WHERE id = ${u.id}`;
    await sql.end();
}
