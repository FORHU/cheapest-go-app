/**
 * POST /api/flights/book
 *
 * Routes booking to the correct provider based on offer ID prefix.
 * Placeholder for Phase 2 — returns mock confirmation for now.
 */

import { NextRequest, NextResponse } from 'next/server';
import { flightRegistry } from '@/lib/flights';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { offerId, passengers, contact } = body;

        if (!offerId) {
            return NextResponse.json(
                { success: false, error: 'offerId is required' },
                { status: 400 }
            );
        }

        if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
            return NextResponse.json(
                { success: false, error: 'At least one passenger is required' },
                { status: 400 }
            );
        }

        // Extract provider from offer ID prefix (e.g., "amadeus_123" → "amadeus")
        const providerName = offerId.split('_')[0];
        const provider = flightRegistry.get(providerName);

        if (!provider) {
            return NextResponse.json(
                { success: false, error: `Unknown provider: ${providerName}` },
                { status: 400 }
            );
        }

        if (!provider.book) {
            // Phase 2: implement provider.book() for real providers
            return NextResponse.json({
                success: true,
                data: {
                    bookingId: `BK${Date.now()}`,
                    pnr: `MOCK${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                    status: 'confirmed' as const,
                    ticketNumbers: [`TKT${Date.now()}`],
                    totalPaid: 0,
                    currency: 'USD',
                },
            });
        }

        const result = await provider.book({
            offerId,
            provider: providerName,
            passengers,
            contact,
        });

        return NextResponse.json(result);
    } catch (err) {
        console.error('[FlightBook] Error:', err);
        return NextResponse.json(
            { success: false, error: 'Booking failed. Please try again.' },
            { status: 500 }
        );
    }
}
