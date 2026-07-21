/**
 * TravelgateX GraphQL client — server-side only.
 *
 * Handles authentication, request construction, and raw response parsing
 * for the HotelX API (OTV/RateHawk supplier).
 */

import { env } from '@/utils/env';

// ─── Config ───────────────────────────────────────────────────────────────────

export function getTgxConfig() {
    return {
        apiKey:       env.TRAVELGATE_API_KEY!,
        accessCode:   env.TRAVELGATE_CODE     || '38327',
        endpoint:     env.TRAVELGATE_ENDPOINT_URL || 'https://api.travelgate.com',
        client:       env.TRAVELGATE_CLIENT   || 'forhuinc',
        supplier:     env.TRAVELGATE_SUPPLIER || 'OTV',
        context:      env.TRAVELGATE_CONTEXT  || 'OTV',
    };
}

export function getTgxSettings(cfg = getTgxConfig(), timeout = 18000) {
    // Do NOT add explicit suppliers here — TGX routes via context automatically,
    // and pinning an accessId filters out results when it doesn't match the account config.
    // timeout: mandatory per TGX docs; max 25,000 ms for Search.
    // auditTransactions: false improves response time.
    return {
        context:           cfg.context,
        client:            cfg.client,
        timeout,
        auditTransactions: false,
    };
}

// ─── GraphQL request ──────────────────────────────────────────────────────────

export async function tgxGraphQL<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
    const cfg = getTgxConfig();

    if (!cfg.apiKey) throw new Error('TRAVELGATEX_API_KEY is not set');

    const payload = JSON.stringify(variables ? { query, variables } : { query });

    if (process.env.NODE_ENV === 'development') {
        console.log('[tgx] →', cfg.endpoint);
        console.log('[tgx] variables:', JSON.stringify(variables, null, 2));
    }

    const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Apikey ${cfg.apiKey}`,
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip',
        },
        body: payload,
        signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[tgx] HTTP error body:', text.slice(0, 2000));
        throw new Error(`TravelgateX API error ${res.status}: ${text.slice(0, 2000)}`);
    }

    const body = await res.json();

    if (process.env.NODE_ENV === 'development') {
        const optionCount = body?.data?.hotelX?.search?.options?.length;
        const errors = body?.data?.hotelX?.search?.errors;
        console.log('[tgx] ← options:', optionCount ?? 'n/a', '| errors:', JSON.stringify(errors ?? []));
    }

    if (body.errors?.length) {
        const msg = body.errors.map((e: any) => e.message || JSON.stringify(e)).join('; ');
        throw new Error(`TravelgateX GraphQL errors: ${msg}`);
    }

    return body as T;
}

// ─── Occupancy builder ────────────────────────────────────────────────────────

export function buildOccupancies(adults: number, children = 0, childrenAges: number[] = []) {
    const paxes: { age: number }[] = [];
    for (let i = 0; i < adults; i++) paxes.push({ age: 30 });
    if (childrenAges.length) {
        for (const age of childrenAges) paxes.push({ age });
    } else {
        for (let i = 0; i < children; i++) paxes.push({ age: 10 });
    }
    return [{ paxes }];
}

// ─── Option normalizer ────────────────────────────────────────────────────────

export interface TgxOption {
    id: string;
    hotelCode: string;
    boardCode: string;
    paymentType: string;
    status: string;
    price: { currency: string; net: number; gross: number };
    token: string;
    rooms?: Array<{ occupancyRefId: number; code: string; description: string; medias?: Array<{ url: string; type?: string }> }>;
    cancelPolicy?: {
        refundable: boolean;
        cancelPenalties?: Array<{
            deadline: string;
            hoursBefore: number;
            penaltyType: string;
            currency: string;
            value?: number;
        }>;
    };
    surcharges?: Array<{ chargeType: string; mandatory: boolean; price: { net: number; gross: number; currency: string } }>;
}

export function normalizeOption(opt: TgxOption) {
    const tokenId = opt.token || opt.id;
    return {
        offerId: `TGX:${tokenId}`,
        roomName: opt.rooms?.[0]?.description || opt.boardCode || 'Room',
        roomCode: opt.rooms?.[0]?.code,
        boardCode: opt.boardCode,
        price: opt.price.gross || opt.price.net,
        net: opt.price.net,
        gross: opt.price.gross,
        currency: opt.price.currency,
        refundable: opt.cancelPolicy?.refundable ?? false,
        refundableTag: opt.cancelPolicy?.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
        cancelPolicy: opt.cancelPolicy,
        rates: [{
            retailRate: {
                total: [{ amount: opt.price.gross || opt.price.net, currency: opt.price.currency }],
                currency: opt.price.currency,
            },
            refundableTag: opt.cancelPolicy?.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
            cancellationPolicies: opt.cancelPolicy?.cancelPenalties || [],
            _tgx: {
                token: opt.token,
                id: opt.id,
                boardCode: opt.boardCode,
                paymentType: opt.paymentType,
                cancelPolicy: opt.cancelPolicy,
            },
        }],
    };
}
