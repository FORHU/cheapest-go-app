/**
 * POST /api/internal/setup-staging-schema
 *
 * One-shot endpoint to create the minimal schema on the staging Coolify Postgres.
 * Protected by INTERNAL_SECRET. Safe to call repeatedly (all statements use IF NOT EXISTS).
 * Remove this file once staging is fully set up.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const secret = req.headers.get('x-internal-secret');
    if (!secret || secret !== process.env.INTERNAL_SECRET) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sql = getSqlAdmin();
    const results: string[] = [];
    const errors: string[] = [];

    async function run(label: string, query: string) {
        try {
            await sql.unsafe(query);
            results.push(`✓ ${label}`);
        } catch (err: any) {
            errors.push(`✗ ${label}: ${err.message}`);
        }
    }

    await run('uuid-ossp extension', `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await run('flight_deals', `
        CREATE TABLE IF NOT EXISTS flight_deals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            baseline_price DECIMAL(10,2),
            original_price DECIMAL(10,2),
            currency TEXT DEFAULT 'USD',
            airline TEXT,
            image_url TEXT,
            departure_date DATE,
            return_date DATE,
            discount_tag TEXT,
            ends_in TEXT,
            cabin_class TEXT DEFAULT 'economy',
            trip_type TEXT DEFAULT 'one-way',
            last_refreshed_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await run('flight_deals updated_at index', `
        CREATE INDEX IF NOT EXISTS idx_flight_deals_updated ON flight_deals(updated_at DESC)
    `);

    await run('hotel_deals', `
        CREATE TABLE IF NOT EXISTS hotel_deals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            hotel_code TEXT,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            rating DECIMAL(3,1) DEFAULT 0,
            reviews INTEGER DEFAULT 0,
            price DECIMAL(10,2) NOT NULL,
            baseline_price DECIMAL(10,2),
            currency TEXT DEFAULT 'USD',
            image_url TEXT,
            discount_tag TEXT,
            check_in DATE,
            check_out DATE,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await run('hotel_deals updated_at index', `
        CREATE INDEX IF NOT EXISTS idx_hotel_deals_updated ON hotel_deals(updated_at DESC)
    `);

    await run('hotel_deals rating index', `
        CREATE INDEX IF NOT EXISTS idx_hotel_deals_rating ON hotel_deals(rating DESC)
    `);

    await run('flight_search_stats', `
        CREATE TABLE IF NOT EXISTS flight_search_stats (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            min_price NUMERIC(12,2),
            avg_price NUMERIC(12,2),
            search_count INT DEFAULT 1,
            last_searched_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(origin, destination)
        )
    `);

    await run('hotel_search_stats', `
        CREATE TABLE IF NOT EXISTS hotel_search_stats (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            destination TEXT NOT NULL,
            min_price NUMERIC(12,2),
            avg_price NUMERIC(12,2),
            search_count INT DEFAULT 1,
            last_searched_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(destination)
        )
    `);

    await run('increment_search_stats function', `
        CREATE OR REPLACE FUNCTION public.increment_search_stats(
            p_origin TEXT,
            p_destination TEXT,
            p_min_price NUMERIC,
            p_avg_price NUMERIC
        ) RETURNS VOID AS $$
        BEGIN
            INSERT INTO flight_search_stats (origin, destination, min_price, avg_price, search_count, last_searched_at)
            VALUES (p_origin, p_destination, p_min_price, p_avg_price, 1, NOW())
            ON CONFLICT (origin, destination) DO UPDATE SET
                search_count = flight_search_stats.search_count + 1,
                min_price = LEAST(flight_search_stats.min_price, EXCLUDED.min_price),
                avg_price = (flight_search_stats.avg_price + EXCLUDED.avg_price) / 2,
                last_searched_at = NOW();
        END;
        $$ LANGUAGE plpgsql
    `);

    return NextResponse.json({
        ok: true,
        results,
        errors,
        summary: `${results.length} succeeded, ${errors.length} failed`,
    });
}
