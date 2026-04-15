import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/utils/env';
import type { NormalizedBagOption, BagType } from '@/types/bags';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flights/bags
 *
 * Fetches available baggage services from Duffel for a given offer.
 * Returns options normalized to passenger indices so the UI doesn't
 * need to know about Duffel passenger IDs.
 *
 * Body: { offerId: string; duffelPassengerIds: string[] }
 * duffelPassengerIds[i] is rawOffer.passengers[i].id — used to map
 * Duffel's passenger_ids back to our 0-based passenger index.
 */
export async function POST(req: NextRequest) {
    const { offerId, duffelPassengerIds } = await req.json();

    if (!offerId) {
        return NextResponse.json({ success: false, error: 'offerId is required' }, { status: 400 });
    }

    const token = env.DUFFEL_TOKEN;
    if (!token) {
        return NextResponse.json({ success: false, error: 'Duffel not configured' }, { status: 503 });
    }

    const res = await fetch(
        `https://api.duffel.com/air/offers/${encodeURIComponent(offerId)}/available_services`,
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Duffel-Version': 'v2',
                'Accept': 'application/json',
            },
        },
    );

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.errors?.[0]?.message ?? `Duffel services error ${res.status}`;
        return NextResponse.json({ success: false, error: msg }, { status: res.status });
    }

    const json = await res.json();
    const services: any[] = json.data ?? [];

    // Build a map from Duffel passenger ID → our passenger index
    const paxIds: string[] = duffelPassengerIds ?? [];
    const paxIdToIndex = new Map<string, number>(paxIds.map((id, i) => [id, i]));

    // Filter to baggage only, normalize
    const bagOptions: NormalizedBagOption[] = [];

    for (const svc of services) {
        if (svc.type !== 'baggage') continue;

        const bagType: BagType =
            svc.metadata?.type === 'carry_on' ? 'carry_on' : 'checked';

        const price = parseFloat(svc.total_amount ?? '0');
        const currency: string = svc.total_currency ?? 'USD';
        const weightRaw = svc.metadata?.maximum_weight_kg;
        const weightKg = weightRaw != null ? parseFloat(weightRaw) : null;
        const maxQuantity: number = svc.maximum_quantity ?? 1;
        const segmentIds: string[] = svc.segment_ids ?? [];

        // Resolve passenger index(es)
        const svcPaxIds: string[] = svc.passenger_ids ?? [];

        if (svcPaxIds.length === 0) {
            // Applies to all passengers — emit one option per passenger
            paxIds.forEach((_, idx) => {
                bagOptions.push({
                    serviceId: svc.id,
                    bagType,
                    price,
                    currency,
                    weightKg,
                    maxQuantity,
                    passengerIndex: idx,
                    appliesToAllSegments: segmentIds.length === 0,
                });
            });
        } else {
            for (const paxId of svcPaxIds) {
                const idx = paxIdToIndex.get(paxId);
                if (idx == null) continue;
                bagOptions.push({
                    serviceId: svc.id,
                    bagType,
                    price,
                    currency,
                    weightKg,
                    maxQuantity,
                    passengerIndex: idx,
                    appliesToAllSegments: segmentIds.length === 0,
                });
            }
        }
    }

    // De-duplicate: same serviceId + passengerIndex can appear from multiple segment mappings
    const seen = new Set<string>();
    const unique = bagOptions.filter(o => {
        const key = `${o.serviceId}:${o.passengerIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return NextResponse.json({ success: true, bagOptions: unique });
}
