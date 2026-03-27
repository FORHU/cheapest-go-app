import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateCancellationFee, isCurrentlyFreeCancellation } from './calculateFee';
import type { CancellationPolicy } from '@/services/booking.service';

describe('calculateCancellationFee', () => {
    beforeEach(() => {
        // Mock current time to 2026-04-01 12:00:00 UTC
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
    });

    describe('NRFN (Non-Refundable) Bookings', () => {
        it('should return full price when past all deadlines', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'NRFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-03-25T00:00:00Z', // 7 days ago
                        amount: 50,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 200, 'USD');

            expect(result).toEqual({
                fee: 200,
                refund: 0,
                currency: 'USD',
            });
        });

        it('should apply tiered cancellation fees (fixed amount)', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'NRFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z', // 4 days from now
                        amount: 50,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                    {
                        cancelTime: '2026-04-10T00:00:00Z', // 9 days from now
                        amount: 20,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 200, 'USD');

            // Currently before first deadline (April 5) → fee = 50
            expect(result).toEqual({
                fee: 50,
                refund: 150,
                currency: 'USD',
            });
        });

        it('should apply percentage-based cancellation fees', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'NRFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z',
                        amount: 25, // 25% of total price
                        currency: 'USD',
                        type: 'PERCENT',
                    },
                    {
                        cancelTime: '2026-04-10T00:00:00Z',
                        amount: 10, // 10% of total price
                        currency: 'USD',
                        type: 'PERCENT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 200, 'USD');

            // 25% of 200 = 50
            expect(result).toEqual({
                fee: 50,
                refund: 150,
                currency: 'USD',
            });
        });

        it('should handle unsorted policies', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'NRFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-10T00:00:00Z', // Later deadline
                        amount: 20,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                    {
                        cancelTime: '2026-04-05T00:00:00Z', // Earlier deadline
                        amount: 50,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 200, 'USD');

            // Should still apply earlier deadline's fee (50)
            expect(result).toEqual({
                fee: 50,
                refund: 150,
                currency: 'USD',
            });
        });
    });

    describe('RFN (Refundable) Bookings', () => {
        it('should return zero fee when explicit free cancellation entry exists', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'RFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z',
                        amount: 0,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                    {
                        cancelTime: '2026-04-10T00:00:00Z',
                        amount: 50,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 200, 'USD');

            expect(result).toEqual({
                fee: 0,
                refund: 200,
                currency: 'USD',
            });
        });

        it('should handle RFN bookings WITHOUT explicit free entry (LiteAPI edge case)', () => {
            // LiteAPI sometimes omits the amount=0 entry for RFN bookings
            const policy: CancellationPolicy = {
                refundableTag: 'RFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z', // 4 days from now
                        amount: 50,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 200, 'USD');

            // Before first deadline AND RFN AND no explicit free entry → fee = 0
            expect(result).toEqual({
                fee: 0,
                refund: 200,
                currency: 'USD',
            });
        });

        it('should charge fee after free cancellation period expires (RFN)', () => {
            // Move time to after first deadline
            vi.setSystemTime(new Date('2026-04-06T12:00:00Z'));

            const policy: CancellationPolicy = {
                refundableTag: 'RFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z', // Yesterday
                        amount: 50,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 200, 'USD');

            // Past the deadline → full charge
            expect(result).toEqual({
                fee: 200,
                refund: 0,
                currency: 'USD',
            });
        });
    });

    describe('Edge Cases', () => {
        it('should return null when no policies exist', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'RFN',
                cancelPolicyInfos: [],
            };

            const result = calculateCancellationFee(policy, 200, 'USD');

            expect(result).toBeNull();
        });

        it('should return null when cancellationPolicies is undefined', () => {
            const result = calculateCancellationFee(undefined, 200, 'USD');

            expect(result).toBeNull();
        });

        it('should return null when cancellationPolicies is null', () => {
            const result = calculateCancellationFee(null, 200, 'USD');

            expect(result).toBeNull();
        });

        it('should handle zero total price', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'RFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z',
                        amount: 0,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 0, 'USD');

            expect(result).toEqual({
                fee: 0,
                refund: 0,
                currency: 'USD',
            });
        });

        it('should handle very large prices correctly', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'NRFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z',
                        amount: 15, // 15%
                        currency: 'USD',
                        type: 'PERCENT',
                    },
                ],
            };

            const result = calculateCancellationFee(policy, 10000, 'USD');

            // 15% of 10000 = 1500
            expect(result).toEqual({
                fee: 1500,
                refund: 8500,
                currency: 'USD',
            });
        });
    });

    describe('isCurrentlyFreeCancellation', () => {
        it('should return true when fee is zero', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'RFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z',
                        amount: 0,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = isCurrentlyFreeCancellation(policy, 200, 'USD');

            expect(result).toBe(true);
        });

        it('should return false when fee is non-zero', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'NRFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z',
                        amount: 50,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = isCurrentlyFreeCancellation(policy, 200, 'USD');

            expect(result).toBe(false);
        });

        it('should fallback to refundableTag when no policies exist', () => {
            const rfnPolicy: CancellationPolicy = {
                refundableTag: 'RFN',
                cancelPolicyInfos: [],
            };

            const nrfnPolicy: CancellationPolicy = {
                refundableTag: 'NRFN',
                cancelPolicyInfos: [],
            };

            expect(isCurrentlyFreeCancellation(rfnPolicy, 200, 'USD')).toBe(true);
            expect(isCurrentlyFreeCancellation(nrfnPolicy, 200, 'USD')).toBe(false);
        });

        it('should handle RFN edge case (omitted free entry)', () => {
            const policy: CancellationPolicy = {
                refundableTag: 'RFN',
                cancelPolicyInfos: [
                    {
                        cancelTime: '2026-04-05T00:00:00Z',
                        amount: 50,
                        currency: 'USD',
                        type: 'AMOUNT',
                    },
                ],
            };

            const result = isCurrentlyFreeCancellation(policy, 200, 'USD');

            expect(result).toBe(true);
        });
    });
});
