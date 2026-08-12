'use client';

import { useTranslations } from 'next-intl';
import { CancellationPolicy } from '@/services/booking.service';
import { Info, AlertTriangle, LogOut, Ban, CheckCircle } from 'lucide-react';
import { extractNoShowPenalty, extractEarlyDepartureFee } from '@/lib/cancellation';
import { formatCurrency } from '@/lib/utils';
import { convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

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

export function CancellationPolicySection({
    cancellationPolicies,
    totalPrice = 0,
    currency = 'USD',
}: CancellationPolicySectionProps) {
    const t = useTranslations('checkout');
    const userCurrency = useUserCurrency();
    const displayCurrency = userCurrency || currency;
    const noShowPenalty = extractNoShowPenalty(cancellationPolicies, currency);
    const earlyDepartureFee = extractEarlyDepartureFee(cancellationPolicies, currency);

    if (!cancellationPolicies?.cancelPolicyInfos?.length && noShowPenalty.amount === 0 && earlyDepartureFee.amount === 0) {
        return null;
    }

    const policies = cancellationPolicies?.cancelPolicyInfos ?? [];
    const tag = cancellationPolicies?.refundableTag ?? '';
    const isRefundable = tag === 'RFN' || tag === 'REFUNDABLE' ||
        (!tag && policies.some(p => p.amount === 0));

    // Filter out special entries (NO_SHOW, EARLY_DEPARTURE) from timeline — they have their own UI cards
    const timelinePolicies = policies.filter((p) => {
        const t = (p.type || '').toUpperCase();
        return !t.includes('NO_SHOW') && !t.includes('NOSHOW') && !t.includes('EARLY_DEPARTURE') && !t.includes('EARLY_CHECKOUT');
    });

    // Sort policies by cancelTime
    const sortedPolicies = [...timelinePolicies].sort(
        (a, b) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime()
    );

    return (
        <div>
            {/* Prominent refundable / non-refundable badge */}
            {isRefundable ? (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {t('cancellation.freeCancellation')}
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <Ban size={14} className="text-red-600 dark:text-red-400 shrink-0" />
                    <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                        {t('cancellation.nonRefundable')}
                    </span>
                </div>
            )}

            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                {t('cancellation.title')}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {t('cancellation.description')}
            </p>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden">
                {sortedPolicies.map((policy, index) => {
                    const isFreeCancellation = policy.amount === 0;
                    const isLastPolicy = index === sortedPolicies.length - 1;
                    const cancelDate = formatCancelDate(policy.cancelTime);

                    // Both feeAmount and refundAmount are kept in displayCurrency so
                    // the subsequent formatCurrency calls don't re-convert them.
                    const feeAmount = policy.type === 'PERCENT'
                        ? (totalPrice * policy.amount / 100)
                        : convertCurrency(policy.amount, policy.currency || currency, displayCurrency);
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
                                    {isFreeCancellation ? t('cancellation.cancelBy') : t('cancellation.cancelAfter')}
                                </span>
                                <br />
                                <span className="text-slate-500 dark:text-slate-400">
                                    {cancelDate}
                                </span>
                            </div>
                            <div className="text-right">
                                {isFreeCancellation ? (
                                    <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                        {t('cancellation.freeCancellationLabel')}
                                        <br />
                                        <span className="text-emerald-500">{t('cancellation.fullRefund')}</span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-600 dark:text-slate-300">
                                        <span className="font-medium">
                                            {formatCurrency(feeAmount, displayCurrency)}
                                        </span>
                                        <br />
                                        <span className="text-slate-500 dark:text-slate-400">
                                            {t('cancellation.refund', { amount: formatCurrency(refundAmount, displayCurrency) })}
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
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>
                    {t('cancellation.footer')}
                </span>
            </div>

            {/* No-Show Penalty */}
            {noShowPenalty.amount > 0 && (
                <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                    <AlertTriangle size={14} className="mt-0.5 text-orange-500 shrink-0" />
                    <div className="text-xs text-orange-700 dark:text-orange-300">
                        {t('cancellation.noShowPenalty', { amount: formatCurrency(convertCurrency(noShowPenalty.amount, noShowPenalty.currency, displayCurrency), displayCurrency) })}
                    </div>
                </div>
            )}

            {/* Early Departure Fee */}
            {earlyDepartureFee.amount > 0 && (
                <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                    <LogOut size={14} className="mt-0.5 text-orange-500 shrink-0" />
                    <div className="text-xs text-orange-700 dark:text-orange-300">
                        {t('cancellation.earlyDepartureFee', { amount: formatCurrency(convertCurrency(earlyDepartureFee.amount, earlyDepartureFee.currency, displayCurrency), displayCurrency) })}
                    </div>
                </div>
            )}

            {/* Hotel remarks if any */}
            {cancellationPolicies?.hotelRemarks && cancellationPolicies.hotelRemarks.length > 0 && (
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
