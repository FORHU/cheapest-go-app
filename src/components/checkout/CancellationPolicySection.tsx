'use client';

import { CancellationPolicy } from '@/lib/server/bookings';
import { Info } from 'lucide-react';

interface CancellationPolicySectionProps {
    cancellationPolicies?: CancellationPolicy;
    totalPrice?: number;
    currency?: string;
}

/**
 * Format date for cancellation deadline display
 * Example: "Feb 5, 2026 09:58 AM"
 */
function formatCancelDate(isoDate: string): string {
    try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return isoDate;
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }) + ' ' + date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return isoDate;
    }
}

/**
 * Format currency amount
 */
function formatAmount(amount: number, currency: string = 'PHP'): string {
    const symbol = currency === 'PHP' ? '₱' : currency === 'USD' ? '$' : currency;
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * CancellationPolicySection component
 * Displays cancellation policy details similar to LiteAPI sandbox
 */
export function CancellationPolicySection({
    cancellationPolicies,
    totalPrice = 0,
    currency = 'PHP',
}: CancellationPolicySectionProps) {
    if (!cancellationPolicies?.cancelPolicyInfos?.length) {
        return null;
    }

    const policies = cancellationPolicies.cancelPolicyInfos;

    // Sort policies by cancelTime
    const sortedPolicies = [...policies].sort(
        (a, b) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime()
    );

    return (
        <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                Cancellation Policy
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                How much will it cost to cancel the rooms?
            </p>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden">
                {sortedPolicies.map((policy, index) => {
                    const isFreeCancellation = policy.amount === 0;
                    const isLastPolicy = index === sortedPolicies.length - 1;
                    const cancelDate = formatCancelDate(policy.cancelTime);

                    // Calculate refund amount (total - fee)
                    const feeAmount = policy.type === 'PERCENT'
                        ? (totalPrice * policy.amount / 100)
                        : policy.amount;
                    const refundAmount = Math.max(0, totalPrice - feeAmount);

                    return (
                        <div
                            key={index}
                            className={`flex justify-between items-start p-3 ${
                                !isLastPolicy ? 'border-b border-slate-200 dark:border-slate-700' : ''
                            }`}
                        >
                            <div className="text-xs text-slate-600 dark:text-slate-300">
                                <span className="font-medium">
                                    {isFreeCancellation ? 'Cancel by' : 'Cancel after'}
                                </span>
                                <br />
                                <span className="text-slate-500 dark:text-slate-400">
                                    {cancelDate}
                                </span>
                            </div>
                            <div className="text-right">
                                {isFreeCancellation ? (
                                    <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                        Free Cancellation
                                        <br />
                                        <span className="text-emerald-500">(Full refund)</span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-600 dark:text-slate-300">
                                        <span className="font-medium">
                                            {formatAmount(feeAmount, policy.currency || currency)}
                                        </span>
                                        <br />
                                        <span className="text-slate-500 dark:text-slate-400">
                                            {formatAmount(refundAmount, policy.currency || currency)} Refund
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer note */}
            <div className="flex items-start gap-2 mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                <Info size={12} className="mt-0.5 flex-shrink-0" />
                <span>
                    Cancellation costs are based on the total booking value. All dates and times are mentioned in GMT.
                </span>
            </div>

            {/* Hotel remarks if any */}
            {cancellationPolicies.hotelRemarks && cancellationPolicies.hotelRemarks.length > 0 && (
                <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                    {cancellationPolicies.hotelRemarks.map((remark, i) => (
                        <p key={i}>{remark}</p>
                    ))}
                </div>
            )}
        </div>
    );
}

export default CancellationPolicySection;
