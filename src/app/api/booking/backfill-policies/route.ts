export const dynamic = 'force-dynamic';

/**
 * POST /api/booking/backfill-policies
 * Temporarily disabled — provider API (ONDA) not yet wired in.
 */
export async function POST() {
    return Response.json(
        { success: false, error: 'Policy backfill temporarily unavailable.' },
        { status: 503 }
    );
}
