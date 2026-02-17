/**
 * POST /api/flights/search
 *
 * Accepts a FlightSearchRequest body, queries all enabled providers
 * via the orchestrator, and returns normalized flight offers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { flightOrchestrator } from '@/lib/flights';
import type { FlightSearchRequest, CabinClass } from '@/lib/flights';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // ─── Validation ──────────────────────────────────────────
        const { segments, passengers, cabinClass, tripType } = body;

        if (!segments || !Array.isArray(segments) || segments.length === 0) {
            return NextResponse.json(
                { success: false, error: 'At least one flight segment is required' },
                { status: 400 }
            );
        }

        for (const seg of segments) {
            if (!seg.origin || !seg.destination || !seg.departureDate) {
                return NextResponse.json(
                    { success: false, error: 'Each segment must have origin, destination, and departureDate' },
                    { status: 400 }
                );
            }
        }

        if (!passengers || !passengers.adults || passengers.adults < 1) {
            return NextResponse.json(
                { success: false, error: 'At least 1 adult passenger is required' },
                { status: 400 }
            );
        }

        // ─── Build Request ───────────────────────────────────────
        const searchRequest: FlightSearchRequest = {
            tripType: tripType || 'one-way',
            segments: segments.map((s: any) => ({
                origin: String(s.origin).toUpperCase(),
                destination: String(s.destination).toUpperCase(),
                departureDate: s.departureDate,
            })),
            passengers: {
                adults: Number(passengers.adults) || 1,
                children: Number(passengers.children) || 0,
                infants: Number(passengers.infants) || 0,
            },
            cabinClass: (cabinClass as CabinClass) || 'economy',
            currency: body.currency || 'USD',
            maxOffers: Math.min(Number(body.maxOffers) || 30, 50),
        };

        // ─── Search ──────────────────────────────────────────────
        console.log('[FlightSearch] Request:', JSON.stringify(searchRequest, null, 2));
        const result = await flightOrchestrator.search(searchRequest);

        return NextResponse.json({
            success: true,
            data: {
                offers: result.offers,
                providers: result.providers,
                totalResults: result.totalResults,
                timestamp: result.timestamp,
            },
        });
    } catch (err) {
        console.error('[FlightSearch] Error:', err);
        return NextResponse.json(
            { success: false, error: 'Flight search failed. Please try again.' },
            { status: 500 }
        );
    }
}
