import type {
    BookingPolicyType,
    PolicyTier,
    BookingPolicySnapshot,
} from '@/types/booking-policy';

// ============================================================================
// Raw LiteAPI shape (defensive — any field may be missing)
// ============================================================================

/**
 * LiteAPI cancellation policy can arrive in multiple shapes.
 * We accept `any` and defensively narrow.
 *
 * Known shapes from LiteAPI prebook/book responses:
 *
 * Shape A (standard):
 *   { cancelPolicyInfos: [{ cancelTime, amount, currency, type }],
 *     hotelRemarks: ["..."],
 *     refundableTag: "REFUNDABLE" | "NON-REFUNDABLE" }
 *
 * Shape B (flat):
 *   { cancellationPolicy: "Non-refundable" }
 *
 * Shape C (nested in bookedRooms):
 *   { bookedRooms: [{ cancellationPolicies: { ... } }] }
 *
 * Shape D (no policy at all):
 *   {} or null
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawPolicy = Record<string, any> | null | undefined;

// ============================================================================
// Safely extract cancellation infos from various LiteAPI shapes
// ============================================================================

interface ParsedCancelInfo {
    cancelTime: string;
    amount: number;
    currency: string;
    type: string; // 'fixed' | 'percent' | 'nights' | etc.
}

function safeParseCancelInfos(raw: RawPolicy): ParsedCancelInfo[] {
    if (!raw) return [];

    // Shape A: direct cancelPolicyInfos array
    const infos =
        raw.cancelPolicyInfos ??
        raw.cancel_policy_infos ??
        raw.cancellation_policy_infos ??
        raw.policies;

    if (Array.isArray(infos)) {
        return infos
            .filter((info: any) => info && typeof info === 'object')
            .map((info: any) => ({
                cancelTime: String(
                    info.cancelTime ?? info.cancel_time ?? info.deadline ?? ''
                ),
                amount: safeNumber(info.amount ?? info.penalty ?? info.fee ?? 0),
                currency: String(info.currency ?? ''),
                type: String(info.type ?? info.penaltyType ?? info.penalty_type ?? 'fixed'),
            }))
            .filter((info) => info.cancelTime.length > 0);
    }

    return [];
}

// ============================================================================
// Safely extract refundable tag
// ============================================================================

function safeRefundableTag(raw: RawPolicy): string | null {
    if (!raw) return null;

    const tag =
        raw.refundableTag ??
        raw.refundable_tag ??
        raw.refundableStatus ??
        raw.cancellationPolicy; // Shape B: flat string like "Non-refundable"

    if (typeof tag === 'string' && tag.length > 0) return tag;
    return null;
}

// ============================================================================
// Safely extract hotel remarks
// ============================================================================

function safeHotelRemarks(raw: RawPolicy): string[] {
    if (!raw) return [];

    const remarks =
        raw.hotelRemarks ??
        raw.hotel_remarks ??
        raw.remarks ??
        raw.hotelNotes;

    if (Array.isArray(remarks)) {
        return remarks.filter((r: any) => typeof r === 'string');
    }
    if (typeof remarks === 'string') return [remarks];
    return [];
}

// ============================================================================
// Safely parse a number from unknown input
// ============================================================================

function safeNumber(val: unknown): number {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string') {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return parsed;
    }
    return 0;
}

// ============================================================================
// Detect no-show penalty from raw response
// ============================================================================

function detectNoShowPenalty(raw: RawPolicy): number {
    if (!raw) return 0;

    // Direct field
    if (raw.noShowPenalty !== undefined) return safeNumber(raw.noShowPenalty);
    if (raw.no_show_penalty !== undefined) return safeNumber(raw.no_show_penalty);
    if (raw.noShowFee !== undefined) return safeNumber(raw.noShowFee);

    // Check inside cancelPolicyInfos for a "NO_SHOW" type entry
    const infos = safeParseCancelInfos(raw);
    const noShowTier = infos.find(
        (i) => i.type.toUpperCase().includes('NO_SHOW') || i.type.toUpperCase().includes('NOSHOW')
    );
    if (noShowTier) return noShowTier.amount;

    // Check hotel remarks for no-show mentions with amounts
    const remarks = safeHotelRemarks(raw);
    for (const remark of remarks) {
        const match = remark.match(/no[- ]?show.*?(\d+[\d,.]*)/i);
        if (match) return safeNumber(match[1].replace(',', ''));
    }

    return 0;
}

// ============================================================================
// Detect early departure fee from raw response
// ============================================================================

function detectEarlyDepartureFee(raw: RawPolicy): number {
    if (!raw) return 0;

    // Direct field
    if (raw.earlyDepartureFee !== undefined) return safeNumber(raw.earlyDepartureFee);
    if (raw.early_departure_fee !== undefined) return safeNumber(raw.early_departure_fee);
    if (raw.earlyCheckoutFee !== undefined) return safeNumber(raw.earlyCheckoutFee);

    // Check inside cancelPolicyInfos for an "EARLY_DEPARTURE" type entry
    const infos = safeParseCancelInfos(raw);
    const edTier = infos.find(
        (i) =>
            i.type.toUpperCase().includes('EARLY_DEPARTURE') ||
            i.type.toUpperCase().includes('EARLY_CHECKOUT')
    );
    if (edTier) return edTier.amount;

    // Check hotel remarks for early departure mentions with amounts
    const remarks = safeHotelRemarks(raw);
    for (const remark of remarks) {
        const match = remark.match(/early\s+(?:departure|checkout).*?(\d+[\d,.]*)/i);
        if (match) return safeNumber(match[1].replace(',', ''));
    }

    return 0;
}

// ============================================================================
// Classify policy type
// ============================================================================

export function classifyPolicyType(raw: RawPolicy): BookingPolicyType {
    if (!raw) return 'non_refundable';

    const tag = safeRefundableTag(raw)?.toUpperCase() ?? '';

    // Explicit non-refundable tag (includes NRFN from LiteAPI)
    if (
        tag === 'NRFN' ||
        tag.includes('NON-REFUNDABLE') ||
        tag.includes('NON_REFUNDABLE') ||
        tag.includes('NONREFUNDABLE')
    ) {
        return 'non_refundable';
    }

    const infos = safeParseCancelInfos(raw);

    // Filter out special entries (no-show, early departure) for classification
    const cancellationTiers = infos.filter(
        (i) =>
            !i.type.toUpperCase().includes('NO_SHOW') &&
            !i.type.toUpperCase().includes('NOSHOW') &&
            !i.type.toUpperCase().includes('EARLY_DEPARTURE') &&
            !i.type.toUpperCase().includes('EARLY_CHECKOUT')
    );

    // No tiers and explicitly tagged REFUNDABLE = free cancellation
    if (cancellationTiers.length === 0) {
        if (tag.includes('REFUNDABLE')) return 'free_cancellation';
        // No tiers and no tag — assume non-refundable (defensive)
        return tag ? 'non_refundable' : 'non_refundable';
    }

    // All tiers have zero penalty = free cancellation
    if (cancellationTiers.every((t) => t.amount === 0)) {
        return 'free_cancellation';
    }

    // Multiple tiers with different amounts = tiered
    if (cancellationTiers.length >= 2) {
        const amounts = new Set(cancellationTiers.map((t) => t.amount));
        if (amounts.size > 1) return 'tiered';
    }

    // Single tier with full amount (equals 100% or total) = non-refundable
    if (
        cancellationTiers.length === 1 &&
        cancellationTiers[0].type.toLowerCase() === 'percent' &&
        cancellationTiers[0].amount >= 100
    ) {
        return 'non_refundable';
    }

    // Single tier with penalty = partial refund
    if (cancellationTiers.length === 1 && cancellationTiers[0].amount > 0) {
        return 'partial_refund';
    }

    // Multiple tiers (even with same amounts but different deadlines) = tiered
    if (cancellationTiers.length >= 2) return 'tiered';

    return 'partial_refund';
}

// ============================================================================
// Extract structured tier rows
// ============================================================================

export function extractTiers(
    raw: RawPolicy,
    fallbackCurrency: string = 'PHP'
): Omit<PolicyTier, 'id'>[] {
    const infos = safeParseCancelInfos(raw);

    // Filter out special entries (no-show, early departure)
    const cancellationTiers = infos.filter(
        (i) =>
            !i.type.toUpperCase().includes('NO_SHOW') &&
            !i.type.toUpperCase().includes('NOSHOW') &&
            !i.type.toUpperCase().includes('EARLY_DEPARTURE') &&
            !i.type.toUpperCase().includes('EARLY_CHECKOUT')
    );

    if (cancellationTiers.length === 0) return [];

    return cancellationTiers
        .sort(
            (a, b) =>
                new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime()
        )
        .map((info, index) => ({
            cancelDeadline: info.cancelTime,
            penaltyAmount: info.amount,
            penaltyType: normalizePenaltyType(info.type),
            currency: info.currency || fallbackCurrency,
            tierOrder: index,
        }));
}

function normalizePenaltyType(
    type: string
): PolicyTier['penaltyType'] {
    const t = type.toLowerCase();
    if (t === 'percent' || t === 'percentage') return 'percent';
    if (t === 'nights' || t === 'night' || t === 'per_night') return 'nights';
    return 'fixed';
}

// ============================================================================
// Find the free cancellation deadline
// ============================================================================

export function findFreeCancelDeadline(
    tiers: Omit<PolicyTier, 'id'>[]
): string | null {
    // Free cancel deadline = the deadline of the LAST tier where penalty is 0
    // (cancel before this time = free, after this time = penalty kicks in)
    const freeTiers = tiers.filter((t) => t.penaltyAmount === 0);
    if (freeTiers.length === 0) return null;

    // Return the latest free-cancel deadline (user can cancel free until then)
    return freeTiers[freeTiers.length - 1].cancelDeadline;
}

// ============================================================================
// Build human-readable summary
// ============================================================================

export function buildPolicySummary(
    policyType: BookingPolicyType,
    tiers: Omit<PolicyTier, 'id'>[],
    freeCancelDeadline: string | null,
    noShowPenalty: number,
    earlyDepartureFee: number,
    currency: string,
): string {
    const parts: string[] = [];

    // Main policy line
    switch (policyType) {
        case 'free_cancellation':
            if (freeCancelDeadline) {
                const d = new Date(freeCancelDeadline);
                const fmt = d.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                });
                parts.push(`Free cancellation before ${fmt}`);
            } else {
                parts.push('Free cancellation');
            }
            break;

        case 'non_refundable':
            parts.push('Non-refundable');
            break;

        case 'partial_refund': {
            const tier = tiers.find((t) => t.penaltyAmount > 0);
            if (tier) {
                const unit =
                    tier.penaltyType === 'percent'
                        ? '%'
                        : tier.penaltyType === 'nights'
                            ? ' night(s)'
                            : ` ${tier.currency}`;
                parts.push(
                    `Cancellation fee: ${tier.penaltyAmount}${unit}`
                );
            } else {
                parts.push('Partial refund available');
            }
            break;
        }

        case 'tiered':
            parts.push(
                `Tiered cancellation — ${tiers.length} deadline${tiers.length > 1 ? 's' : ''}`
            );
            break;
    }

    // Add no-show line
    if (noShowPenalty > 0) {
        parts.push(`No-show penalty: ${noShowPenalty} ${currency}`);
    }

    // Add early departure line
    if (earlyDepartureFee > 0) {
        parts.push(`Early departure fee: ${earlyDepartureFee} ${currency}`);
    }

    return parts.join('. ');
}

// ============================================================================
// Main normalizer — public API
// ============================================================================

export interface NormalizedPolicy {
    snapshot: Omit<BookingPolicySnapshot, 'id' | 'tiers' | 'capturedAt'>;
    tiers: Omit<PolicyTier, 'id'>[];
}

/**
 * Normalizes a raw LiteAPI cancellation policy response into our internal schema.
 *
 * Accepts the full LiteAPI booking/prebook response.
 * Extracts and classifies cancellation policy, tiers, and penalties.
 * Stores the raw JSON unchanged for future reference.
 *
 * @example — Example LiteAPI response mappings:
 *
 * 1. Free cancellation:
 *    Input:  { refundableTag: "REFUNDABLE", cancelPolicyInfos: [{ cancelTime: "2026-03-01T18:00:00Z", amount: 0, currency: "PHP", type: "fixed" }] }
 *    Output: policyType = "free_cancellation", tiers = [{ cancelDeadline: "2026-03-01T18:00:00Z", penaltyAmount: 0, ... }]
 *            summary = "Free cancellation before Mar 1, 2026"
 *
 * 2. Non-refundable:
 *    Input:  { refundableTag: "NON-REFUNDABLE", cancelPolicyInfos: [] }
 *    Output: policyType = "non_refundable", tiers = []
 *            summary = "Non-refundable"
 *
 * 3. Partial refund:
 *    Input:  { refundableTag: "REFUNDABLE", cancelPolicyInfos: [{ cancelTime: "2026-03-01T18:00:00Z", amount: 2500, currency: "PHP", type: "fixed" }] }
 *    Output: policyType = "partial_refund", tiers = [{ penaltyAmount: 2500, ... }]
 *            summary = "Cancellation fee: 2500 PHP"
 *
 * 4. Tiered:
 *    Input:  { refundableTag: "REFUNDABLE", cancelPolicyInfos: [
 *               { cancelTime: "2026-02-25T18:00:00Z", amount: 0,    currency: "PHP", type: "fixed" },
 *               { cancelTime: "2026-03-01T18:00:00Z", amount: 2500, currency: "PHP", type: "fixed" },
 *               { cancelTime: "2026-03-05T18:00:00Z", amount: 5000, currency: "PHP", type: "fixed" },
 *             ] }
 *    Output: policyType = "tiered", tiers = [3 tiers sorted by deadline]
 *            summary = "Tiered cancellation — 3 deadlines"
 *
 * 5. No-show penalty:
 *    Input:  { refundableTag: "REFUNDABLE", cancelPolicyInfos: [...], noShowPenalty: 5000 }
 *    Output: noShowPenalty = 5000, appended to summary
 *
 * 6. Null / missing policy:
 *    Input:  null
 *    Output: policyType = "non_refundable", tiers = [], summary = "Non-refundable"
 */
export function normalizeLiteApiPolicy(
    bookingId: string,
    cancellationPolicies: RawPolicy,
    rawResponse: Record<string, unknown>,
    currency: string = 'PHP',
): NormalizedPolicy {
    const policyType = classifyPolicyType(cancellationPolicies);
    const tiers = extractTiers(cancellationPolicies, currency);
    const freeCancelDeadline = findFreeCancelDeadline(tiers);
    const noShowPenalty = detectNoShowPenalty(cancellationPolicies);
    const earlyDepartureFee = detectEarlyDepartureFee(cancellationPolicies);
    const summary = buildPolicySummary(
        policyType, tiers, freeCancelDeadline,
        noShowPenalty, earlyDepartureFee, currency,
    );

    return {
        snapshot: {
            bookingId,
            policyType,
            summary,
            refundableTag: safeRefundableTag(cancellationPolicies),
            hotelRemarks: safeHotelRemarks(cancellationPolicies),
            noShowPenalty,
            earlyDepartureFee,
            freeCancelDeadline,
            rawLiteapiResponse: rawResponse,
        },
        tiers,
    };
}
