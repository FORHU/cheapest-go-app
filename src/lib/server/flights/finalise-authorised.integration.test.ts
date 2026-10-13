import { describe, it, expect, afterEach } from 'vitest';

/**
 * The claim is what stops two paths buying two tickets for one booking, so it is tested against
 * a real database: the guarantee lives in what Postgres does with the UPDATE, not in our code.
 * Skips when no database is reachable, like its sibling *.integration.test.ts files.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

const created: string[] = [];

async function db() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function makeSession(
    status: string,
    updatedAtAgoMinutes = 0,
    flight: Record<string, unknown> = { _rawOffer: { id: 'off_int_1' } },
): Promise<{ id: string; userId: string }> {
    const sql = await db();
    const [user] = await sql`SELECT id FROM users LIMIT 1`;
    // sql.json, as the app writes it: JSON.stringify(x)::jsonb would store a JSON string, not the object.
    const [row] = await sql`
        INSERT INTO booking_sessions (user_id, provider, status, expires_at, flight, updated_at)
        VALUES (${user.id}, 'duffel', ${status}, now() + interval '30 minutes',
                ${sql.json(flight as any)}::jsonb,
                now() - make_interval(mins => ${updatedAtAgoMinutes}))
        RETURNING id`;
    created.push(row.id);
    return { id: row.id, userId: user.id };
}

afterEach(async () => {
    if (created.length) {
        const sql = await db();
        await sql`DELETE FROM booking_sessions WHERE id = ANY(${created})`;
        created.length = 0;
    }
});

describe('sqlSessionStore.claim', async () => {
    const reachable = await databaseReachable();
    const maybe = reachable ? it : it.skip;

    maybe('is taken once: the second claimer gets nothing', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('payment_initiated');

        const first = await store.claim(id, 8 * 60_000);
        const second = await store.claim(id, 8 * 60_000);

        expect(first?.id).toBe(id);
        expect(first?.previousClaimAt).toBeNull();
        expect(second).toBeNull();
    });

    maybe('is not taken over while the previous claim is recent', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('ordering', 2);

        expect(await store.claim(id, 8 * 60_000)).toBeNull();
    });

    maybe('is taken over once the previous claim is stale, and says when it began', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const { id } = await makeSession('ordering', 20);

        const taken = await store.claim(id, 8 * 60_000);

        expect(taken?.id).toBe(id);
        expect(taken?.previousClaimAt).not.toBeNull();
    });

    maybe('does not claim a session that is already booked or failed', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const store = sqlSessionStore(await db());
        const booked = await makeSession('booked');
        const failed = await makeSession('failed');

        expect(await store.claim(booked.id, 8 * 60_000)).toBeNull();
        expect(await store.claim(failed.id, 8 * 60_000)).toBeNull();
    });

    maybe('hands back to payment_authorized when released', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const sql = await db();
        const store = sqlSessionStore(sql);
        const { id } = await makeSession('payment_initiated');

        await store.claim(id, 8 * 60_000);
        await store.release(id);

        const [row] = await sql`SELECT status FROM booking_sessions WHERE id = ${id}`;
        expect(row.status).toBe('payment_authorized');
    });
});

describe('sqlSessionStore writes JSON columns as JSON objects', async () => {
    const reachable = await databaseReachable();
    const maybe = reachable ? it : it.skip;

    const recorded = {
        orderId: 'ord_int_1', pnr: 'ABC123', tickets: ['0161234567890'], ticketed: true,
        originalPrice: 100, chargedPrice: 110,
        flight: {
            price: 100,
            _rawOffer: { id: 'off_int_1' },
            segments: [{ origin: 'MNL', destination: 'CEB', departureTime: '2026-11-01T08:00:00', arrivalTime: '2026-11-01T09:30:00' }],
        },
    };

    maybe('keeps the booked itinerary an object, so the segments can be read back', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const sql = await db();
        const store = sqlSessionStore(sql);
        const { id } = await makeSession('ordering');

        await store.recordOrder(id, recorded as any);

        const [row] = await sql`
            SELECT jsonb_typeof(flight) AS kind, jsonb_array_length(flight->'segments') AS segments
              FROM booking_sessions WHERE id = ${id}`;
        // A JSON string here reads back as "no segments": the booking is created with no flight details.
        expect(row.kind).toBe('object');
        expect(row.segments).toBe(1);
    });

    maybe('keeps the session findable by its offer after the order is recorded', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const sql = await db();
        const store = sqlSessionStore(sql);
        const first = await makeSession('ordering', 0, { _rawOffer: { id: 'off_dup_1' } });
        const second = await makeSession('ordering', 0, { _rawOffer: { id: 'off_dup_1' } });
        const passengers = [{ firstName: 'Ana', lastName: 'Cruz', birthDate: '1990-01-01' }];
        await sql`UPDATE booking_sessions SET passengers = ${sql.json(passengers as any)}::jsonb WHERE id = ${first.id}`;
        await store.recordOrder(first.id, { ...recorded, flight: { _rawOffer: { id: 'off_dup_1' }, segments: [] } } as any);

        const found = await store.otherLiveOrder({
            userId: first.userId, offerId: 'off_dup_1', excludeSessionId: second.id, passengers, windowMs: 60 * 60_000,
        });

        // The duplicate-order guard looks inside flight; if recordOrder made it a string it finds nothing.
        expect(found).toBe(true);
    });

    maybe('stores a refusal as an object, so the status poll can read its fields', async () => {
        const { sqlSessionStore } = await import('./finalise-authorised');
        const sql = await db();
        const store = sqlSessionStore(sql);
        const { id } = await makeSession('ordering');

        await store.fail(id, { errorCode: 'price_changed', message: 'The fare changed.' } as any);

        const [row] = await sql`
            SELECT jsonb_typeof(failure) AS kind, failure->>'errorCode' AS code FROM booking_sessions WHERE id = ${id}`;
        expect(row.kind).toBe('object');
        expect(row.code).toBe('price_changed');
    });
});
