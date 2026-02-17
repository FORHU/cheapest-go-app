"use client";

import React from 'react';
import { Calendar, Info, AlertTriangle, LogOut } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CancelPolicyInfo } from '@/services/booking.service';

interface CancellationPoliciesProps {
    policies: CancelPolicyInfo[] | undefined;
    hotelRemarks?: string[];
    /** No-show penalty amount (from policy snapshot) */
    noShowPenalty?: number;
    /** Early departure / early checkout fee (from policy snapshot) */
    earlyDepartureFee?: number;
    /** Currency code for formatting penalties */
    currency?: string;
}

export function CancellationPolicies({
    policies,
    hotelRemarks,
    noShowPenalty = 0,
    earlyDepartureFee = 0,
    currency = 'PHP',
}: CancellationPoliciesProps) {
    const hasNoPolicies = !policies || policies.length === 0;
    const hasExtraFees = noShowPenalty > 0 || earlyDepartureFee > 0;

    if (hasNoPolicies && !hasExtraFees) {
        return (
            <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5 p-4 rounded-lg">
                <Info className="inline-block w-4 h-4 mr-2" />
                No specific cancellation policy available. Standard terms apply.
            </div>
        );
    }

    // Filter out special entries (NO_SHOW, EARLY_DEPARTURE) from timeline — they have their own UI cards
    const timelinePolicies = policies?.filter((p) => {
        const t = (p.type || '').toUpperCase();
        return !t.includes('NO_SHOW') && !t.includes('NOSHOW') && !t.includes('EARLY_DEPARTURE') && !t.includes('EARLY_CHECKOUT');
    });

    return (
        <div className="space-y-3">
            {/* Cancellation tier timeline */}
            {timelinePolicies?.map((policy, index) => {
                const policyTime = new Date(policy.cancelTime);
                const isPast = policyTime < new Date();
                const feeAmount = policy.type === 'PERCENT'
                    ? `${policy.amount}%`
                    : formatCurrency(policy.amount, policy.currency);

                return (
                    <div
                        key={index}
                        className={`flex items-start gap-3 p-3 rounded-lg ${
                            isPast
                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                : 'bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10'
                        }`}
                    >
                        <Calendar className={`w-5 h-5 mt-0.5 ${isPast ? 'text-red-500' : 'text-slate-400'}`} />
                        <div className="flex-1">
                            <p className={`text-sm font-medium ${isPast ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                {isPast ? 'Passed: ' : 'Before: '}
                                {formatDate(policy.cancelTime, {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                }, 'en-US')}
                            </p>
                            <p className={`text-sm ${isPast ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                Cancellation fee: {feeAmount}
                            </p>
                        </div>
                    </div>
                );
            })}

            {/* No-Show Penalty */}
            {noShowPenalty > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                    <AlertTriangle className="w-5 h-5 mt-0.5 text-orange-500" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                            No-Show Penalty
                        </p>
                        <p className="text-sm text-orange-600 dark:text-orange-400">
                            {formatCurrency(noShowPenalty, currency)} will be charged if you don&apos;t check in without cancelling.
                        </p>
                    </div>
                </div>
            )}

            {/* Early Departure Fee */}
            {earlyDepartureFee > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                    <LogOut className="w-5 h-5 mt-0.5 text-orange-500" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                            Early Departure Fee
                        </p>
                        <p className="text-sm text-orange-600 dark:text-orange-400">
                            {formatCurrency(earlyDepartureFee, currency)} fee applies if you check out before your scheduled date.
                        </p>
                    </div>
                </div>
            )}

            {/* Hotel Remarks */}
            {hotelRemarks && hotelRemarks.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 mt-2">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2 text-sm">
                        Important Notes
                    </h4>
                    <ul className="space-y-1">
                        {hotelRemarks.map((remark, idx) => (
                            <li key={idx} className="text-xs text-amber-700 dark:text-amber-300">
                                • {remark}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
