import { NextResponse } from 'next/server';
import { fetchTripsData } from '@/lib/trips/fetchTripsData';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await fetchTripsData();
        return NextResponse.json({
            flights: data.flightBookings ?? [],
            hotels: data.bookings ?? [],
        });
    } catch (err) {
        console.error('[mobile/trips] error:', (err as Error).message??err);
        return NextResponse.json({flights: [], hotels: []});
    }
}