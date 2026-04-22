import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import type { DuffelSeatMapEntry, NormalizedSegmentSeatMap, SeatRow, NormalizedSeat } from '@/types/seatMap';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { offerId, segments } = await req.json();

    if (!offerId) {
        return NextResponse.json({ success: false, error: 'offerId is required' }, { status: 400 });
    }

    const token = env.DUFFEL_TOKEN;
    if (!token) {
        return NextResponse.json({ success: false, error: 'Duffel not configured' }, { status: 503 });
    }

    const res = await fetch(`https://api.duffel.com/air/seat_maps?offer_id=${encodeURIComponent(offerId)}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Duffel-Version': 'v2',
            'Accept': 'application/json',
        },
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.errors?.[0]?.message ?? `Duffel seat map error ${res.status}`;
        console.error(`[seat-map] Duffel ${res.status} for offer ${offerId}:`, msg);
        const clientMsg = res.status === 404
            ? 'This offer has expired. Please go back and search again for updated prices.'
            : res.status === 422
                ? 'Seat selection is not available for this flight.'
                : msg;
        return NextResponse.json({ success: false, error: clientMsg }, { status: res.status });
    }

    const json = await res.json();
    const raw: DuffelSeatMapEntry[] = json.data ?? [];

    const normalized: NormalizedSegmentSeatMap[] = raw.map((entry, idx) =>
        normalizeEntry(entry, idx, segments)
    );

    if (normalized.length === 0) {
        console.log(`[seat-map] Duffel returned 0 seat maps for offer ${offerId} (airline doesn't support seat selection)`);
    }
    return NextResponse.json({ success: true, seatMaps: normalized });
}

// ─── Normalize one Duffel seat map entry ────────────────────────────────────
// Per Duffel docs: each entry maps to one flight segment.
// cabins[] → pick economy (or first). rows[] → sections[] → elements[].
// element.type: "seat" | "bassinet" | "empty"
// seat.available_services[]: empty = NOT available for selection (occupied or blocked).
// seat.disclosures[]: "WINDOW", "AISLE", "MIDDLE", "EXTRA_LEGROOM", "EXIT_ROW", etc.

function normalizeEntry(
    entry: DuffelSeatMapEntry,
    idx: number,
    segments?: { origin: string; destination: string }[]
): NormalizedSegmentSeatMap {
    // Select economy cabin first; fall back to first cabin
    const cabin = entry.cabins.find(c => c.cabin_class === 'economy')
        ?? entry.cabins.find(c => c.cabin_class === 'economy_premium')
        ?? entry.cabins[0];

    const rows: SeatRow[] = [];

    // ── First pass: collect all rows ────────────────────────────────────
    for (const row of (cabin?.rows ?? [])) {
        const rowSeats: NormalizedSeat[][] = [];
        let rowNumber = 0;

        for (const section of row.sections) {
            const sectionSeats: NormalizedSeat[] = [];

            for (const el of section.elements) {
                if (el.type === 'seat' && el.designator) {
                    const match = el.designator.match(/^(\d+)([A-Z]+)$/);
                    if (match) rowNumber = parseInt(match[1], 10);

                    // Per Duffel docs:
                    // - available_services[] empty → seat not available for selection
                    //   (could be occupied, or blocked/crew, or included in fare with no upsell)
                    // - available_services[0].total_amount === "0.00" → free seat selection
                    // - available_services[0].total_amount > 0 → paid upgrade
                    const service = el.available_services[0] ?? null;
                    const isSelectable = el.available_services.length > 0;
                    const disclosures = (el.disclosures ?? []).map((d: string) => d.toUpperCase());

                    const seatType = disclosures.includes('WINDOW')
                        ? 'window'
                        : disclosures.includes('AISLE')
                            ? 'aisle'
                            : disclosures.includes('MIDDLE')
                                ? 'middle'
                                : 'unknown';

                    sectionSeats.push({
                        designator: el.designator,
                        elementType: 'seat',
                        type: seatType,
                        status: isSelectable ? 'available' : 'occupied',
                        price: service ? parseFloat(service.total_amount) : null,
                        currency: service?.total_currency ?? 'USD',
                        serviceId: service?.id ?? null,
                        extraLegroom: disclosures.includes('EXTRA_LEGROOM') || disclosures.includes('LEGROOM'),
                        isExit: disclosures.includes('EXIT_ROW'),
                    });
                } else {
                    // Non-seat element (empty space, galley, lavatory, bassinet, etc.)
                    sectionSeats.push({
                        designator: el.type ?? 'empty',
                        elementType: 'empty',
                        type: 'unknown',
                        status: 'restricted',
                        price: null,
                        currency: 'USD',
                        serviceId: null,
                        extraLegroom: false,
                        isExit: false,
                    });
                }
            }

            if (sectionSeats.length > 0) rowSeats.push(sectionSeats);
        }

        if (rowNumber > 0 && rowSeats.length > 0) {
            rows.push({ rowNumber, sections: rowSeats });
        }
    }

    // ── Build column headers from the most representative row ────────────
    // Use the row with the most seats (avoids exit/galley rows at the front
    // that may have fewer seats than the main cabin).
    const columnHeaders: string[][] = [];
    if (rows.length > 0) {
        const referenceRow = rows.reduce((best, r) => {
            const bestCount = best.sections.flat().filter(s => s.elementType === 'seat').length;
            const count = r.sections.flat().filter(s => s.elementType === 'seat').length;
            return count > bestCount ? r : best;
        }, rows[0]);

        for (const section of referenceRow.sections) {
            const labels = section
                .filter(s => s.elementType === 'seat')
                .map(s => s.designator.replace(/^\d+/, ''));
            if (labels.length > 0) columnHeaders.push(labels);
        }
    }

    return {
        segmentIndex: idx,
        segmentId: entry.id,
        origin: segments?.[idx]?.origin ?? '',
        destination: segments?.[idx]?.destination ?? '',
        cabinClass: cabin?.cabin_class ?? 'economy',
        rows,
        columnHeaders,
    };
}
