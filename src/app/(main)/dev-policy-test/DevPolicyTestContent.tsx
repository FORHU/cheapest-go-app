'use client';

/**
 * DEV-ONLY: Policy Test Page
 * Visit /dev-policy-test to see how no-show, early departure, and cancellation policies render.
 * DELETE THIS FILE before deploying to production.
 */

import React, { useState } from 'react';
import { CancellationPolicies } from '@/components/trips/CancellationPolicies';
import { CancellationPolicySection } from '@/components/checkout/CancellationPolicySection';
import { CancellationFeeCard } from '@/components/trips/CancellationFeeCard';
import type { CancellationFeeResult } from '@/lib/cancellation';
import type { CancelPolicyInfo, CancellationPolicy } from '@/services/booking.service';

// ============================================================================
// Mock Data Scenarios
// ============================================================================

const SCENARIOS = {
    rfnWithNoShow: {
        label: 'RFN + No-Show Penalty + Early Departure (via cancelPolicyInfos type)',
        policy: {
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                { cancelTime: '2026-03-15T18:00:00Z', amount: 0, currency: 'PHP', type: 'fixed' },
                { cancelTime: '2026-03-20T18:00:00Z', amount: 2500, currency: 'PHP', type: 'fixed' },
                { cancelTime: '2026-03-22T18:00:00Z', amount: 5000, currency: 'PHP', type: 'NO_SHOW' },
                { cancelTime: '2026-03-22T18:00:00Z', amount: 1500, currency: 'PHP', type: 'EARLY_DEPARTURE' },
            ],
            hotelRemarks: ['Check-in after 2:00 PM', 'Photo ID required at check-in'],
        } as CancellationPolicy,
        totalPrice: 8000,
    },
    nrfnBasic: {
        label: 'NRFN Non-Refundable (no tiers)',
        policy: {
            refundableTag: 'NRFN',
            cancelPolicyInfos: [],
            hotelRemarks: ['This booking is non-refundable.'],
        } as CancellationPolicy,
        totalPrice: 5000,
    },
    remarksNoShow: {
        label: 'RFN + No-Show in hotelRemarks text (regex extraction)',
        policy: {
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                { cancelTime: '2026-04-01T14:00:00Z', amount: 0, currency: 'PHP', type: 'fixed' },
                { cancelTime: '2026-04-05T14:00:00Z', amount: 3000, currency: 'PHP', type: 'PERCENT' },
            ],
            hotelRemarks: [
                'Free cancellation before April 1.',
                'No-show penalty of 7500 PHP applies if guest does not arrive.',
                'Early departure fee: 2000 PHP for checkout before scheduled date.',
            ],
        } as CancellationPolicy,
        totalPrice: 12000,
    },
    remarksStringFormat: {
        label: 'hotelRemarks as single string (LiteAPI sometimes sends this)',
        policy: {
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                { cancelTime: '2026-05-10T00:00:00Z', amount: 0, currency: 'PHP', type: 'fixed' },
            ],
            // Simulating hotelRemarks as a string (LiteAPI inconsistency)
            hotelRemarks: 'No-show charge of 4000 PHP. Early checkout fee: 1500 PHP if leaving before scheduled checkout.' as unknown as string[],
        } as CancellationPolicy,
        totalPrice: 9000,
    },
    tieredWithAll: {
        label: 'Tiered + No-Show + Early Departure (everything)',
        policy: {
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                { cancelTime: '2026-03-01T00:00:00Z', amount: 0, currency: 'PHP', type: 'fixed' },
                { cancelTime: '2026-03-10T00:00:00Z', amount: 1500, currency: 'PHP', type: 'fixed' },
                { cancelTime: '2026-03-15T00:00:00Z', amount: 4000, currency: 'PHP', type: 'fixed' },
                { cancelTime: '2026-03-15T00:00:00Z', amount: 10000, currency: 'PHP', type: 'NO_SHOW' },
                { cancelTime: '2026-03-15T00:00:00Z', amount: 3000, currency: 'PHP', type: 'EARLY_CHECKOUT' },
            ],
            hotelRemarks: ['Government-issued ID required. Pets not allowed.'],
        } as CancellationPolicy,
        totalPrice: 15000,
    },
    noFees: {
        label: 'Standard RFN (no special fees — should show nothing extra)',
        policy: {
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                { cancelTime: '2026-06-01T18:00:00Z', amount: 0, currency: 'PHP', type: 'fixed' },
                { cancelTime: '2026-06-10T18:00:00Z', amount: 3500, currency: 'PHP', type: 'fixed' },
            ],
            hotelRemarks: ['Free parking available.'],
        } as CancellationPolicy,
        totalPrice: 7000,
    },
};

type ScenarioKey = keyof typeof SCENARIOS;

export function DevPolicyTestContent() {
    const [activeScenario, setActiveScenario] = useState<ScenarioKey>('rfnWithNoShow');

    const scenario = SCENARIOS[activeScenario];
    const policy = scenario.policy;

    // Filter out special entries for timeline display (same as normalizer does)
    const timelinePolicies = (policy.cancelPolicyInfos || []).filter((p: CancelPolicyInfo) => {
        const t = (p.type || '').toUpperCase();
        return !t.includes('NO_SHOW') && !t.includes('NOSHOW') && !t.includes('EARLY_DEPARTURE') && !t.includes('EARLY_CHECKOUT');
    });

    // Mock fee result
    const mockFeeResult: CancellationFeeResult = {
        fee: policy.refundableTag === 'NRFN' ? scenario.totalPrice : 0,
        refund: policy.refundableTag === 'NRFN' ? 0 : scenario.totalPrice,
        currency: 'PHP',
        isFreeCancellation: policy.refundableTag !== 'NRFN',
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 py-10 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 mb-6">
                    <p className="text-sm font-bold text-yellow-800 dark:text-yellow-200">
                        ⚠️ DEV-ONLY TEST PAGE — Delete before production
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                        This page tests no-show penalty, early departure fee, and cancellation policy UI rendering with mock data.
                    </p>
                </div>

                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                    Policy Component Test
                </h1>

                {/* Scenario Selector */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-8">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Select Scenario</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
                            <button
                                key={key}
                                onClick={() => setActiveScenario(key)}
                                className={`text-left text-xs p-3 rounded-lg border transition-colors ${activeScenario === key
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                                    }`}
                            >
                                {SCENARIOS[key].label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Active scenario info */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 mb-6 text-xs font-mono text-slate-600 dark:text-slate-400">
                    <p><strong>refundableTag:</strong> {policy.refundableTag}</p>
                    <p><strong>totalPrice:</strong> ₱{scenario.totalPrice.toLocaleString()}</p>
                    <p><strong>cancelPolicyInfos:</strong> {(policy.cancelPolicyInfos || []).length} entries</p>
                    <p><strong>hotelRemarks type:</strong> {typeof policy.hotelRemarks === 'string' ? 'string' : 'string[]'}</p>
                </div>

                {/* Component 1: CancellationPolicies (Trips Modal Timeline) */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                        1. CancellationPolicies
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        Used in: CancellationModal → Cancellation Policy Timeline
                    </p>
                    <CancellationPolicies
                        policies={timelinePolicies}
                        hotelRemarks={Array.isArray(policy.hotelRemarks) ? policy.hotelRemarks : undefined}
                        noShowPenalty={
                            (policy.cancelPolicyInfos || []).find((p: CancelPolicyInfo) => {
                                const t = (p.type || '').toUpperCase();
                                return t.includes('NO_SHOW') || t.includes('NOSHOW');
                            })?.amount || 0
                        }
                        earlyDepartureFee={
                            (policy.cancelPolicyInfos || []).find((p: CancelPolicyInfo) => {
                                const t = (p.type || '').toUpperCase();
                                return t.includes('EARLY_DEPARTURE') || t.includes('EARLY_CHECKOUT');
                            })?.amount || 0
                        }
                        currency="PHP"
                    />
                </div>

                {/* Component 2: CancellationFeeCard */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                        2. CancellationFeeCard
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        Used in: CancellationModal → Shows fee/refund breakdown
                    </p>
                    <CancellationFeeCard feeResult={mockFeeResult} />
                </div>

                {/* Component 3: CancellationPolicySection (Checkout) */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                        3. CancellationPolicySection
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        Used in: Checkout page → Shows policy before booking
                    </p>
                    <CancellationPolicySection
                        cancellationPolicies={policy}
                        totalPrice={scenario.totalPrice}
                        currency="PHP"
                    />
                </div>
            </div>
        </div>
    );
}
