import React from 'react';
import { Clock, Info, XCircle, CheckCircle, AlertTriangle, LogOut } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize-html';

interface CancellationPolicy {
    cancelTime?: string;
    amount?: number;
    currency?: string;
    type?: string;
    timezone?: string;
}

interface CancellationPolicies {
    cancelPolicyInfos?: CancellationPolicy[];
    hotelRemarks?: string;
    refundableTag?: string;
}

interface PoliciesSectionProps {
    checkInTime?: string;
    checkOutTime?: string;
    hotelImportantInformation?: string;
    cancellationPolicies?: CancellationPolicies;
}

// Format cancellation time for display
function formatCancellationTime(cancelTime: string): string {
    try {
        const date = new Date(cancelTime);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    } catch {
        return cancelTime;
    }
}

/**
 * Extract no-show penalty from cancelPolicyInfos or hotelRemarks.
 * Server-safe (no client dependencies).
 */
function detectNoShowPenalty(policies?: CancellationPolicy[], hotelRemarks?: string): number {
    // Check cancelPolicyInfos for NO_SHOW type entry
    if (policies) {
        const noShowEntry = policies.find(
            (p) => {
                const t = (p.type || '').toUpperCase();
                return t.includes('NO_SHOW') || t.includes('NOSHOW');
            }
        );
        if (noShowEntry?.amount) return noShowEntry.amount;
    }

    // Check hotelRemarks for no-show mention with amount
    if (hotelRemarks) {
        const match = hotelRemarks.match(/no[- ]?show.*?(\d+[\d,.]*)/i);
        if (match) return parseFloat(match[1].replace(',', '')) || 0;
    }

    return 0;
}

/**
 * Extract early departure / early checkout fee from cancelPolicyInfos or hotelRemarks.
 * Server-safe (no client dependencies).
 */
function detectEarlyDepartureFee(policies?: CancellationPolicy[], hotelRemarks?: string): number {
    // Check cancelPolicyInfos for EARLY_DEPARTURE / EARLY_CHECKOUT type entry
    if (policies) {
        const edEntry = policies.find(
            (p) => {
                const t = (p.type || '').toUpperCase();
                return t.includes('EARLY_DEPARTURE') || t.includes('EARLY_CHECKOUT');
            }
        );
        if (edEntry?.amount) return edEntry.amount;
    }

    // Check hotelRemarks for early departure/checkout mention with amount
    if (hotelRemarks) {
        const match = hotelRemarks.match(/early\s+(?:departure|checkout).*?(\d+[\d,.]*)/i);
        if (match) return parseFloat(match[1].replace(',', '')) || 0;
    }

    return 0;
}

/** Format currency for display */
function formatFeeAmount(amount: number, currency?: string): string {
    const symbol = currency === 'USD' ? '$' : currency === 'PHP' ? '₱' : currency || '₱';
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PoliciesSection: React.FC<PoliciesSectionProps> = ({
    checkInTime,
    checkOutTime,
    hotelImportantInformation,
    cancellationPolicies
}) => {
    // If no policy data is available at all, don't render the section
    const hasAnyData = checkInTime || checkOutTime || hotelImportantInformation || cancellationPolicies;

    if (!hasAnyData) {
        return null;
    }

    const isRefundable = cancellationPolicies?.refundableTag === 'RFN';

    // Extract special fees
    const noShowPenalty = detectNoShowPenalty(
        cancellationPolicies?.cancelPolicyInfos,
        cancellationPolicies?.hotelRemarks
    );
    const earlyDepartureFee = detectEarlyDepartureFee(
        cancellationPolicies?.cancelPolicyInfos,
        cancellationPolicies?.hotelRemarks
    );

    // Get currency from first policy entry
    const feeCurrency = cancellationPolicies?.cancelPolicyInfos?.[0]?.currency;

    return (
        <div className="py-4 lg:py-8 border-t border-slate-200 dark:border-white/10 scroll-mt-24 lg:scroll-mt-36" id="policies">
            <h2 className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-3 lg:mb-6">Policies</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-8">
                {/* Check-in / Check-out */}
                {(checkInTime || checkOutTime) && (
                    <div className="space-y-1.5 lg:space-y-4">
                        <h3 className="text-[11px] lg:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 lg:gap-2">
                            <Clock size={12} className="lg:hidden" /><Clock size={18} className="hidden lg:block" />
                            Check-in & Check-out
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 lg:p-4 space-y-1.5 lg:space-y-3">
                            {checkInTime && (
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] lg:text-sm text-slate-600 dark:text-slate-400">Check-in</span>
                                    <span className="text-[10px] lg:text-sm font-medium text-slate-900 dark:text-white">{checkInTime}</span>
                                </div>
                            )}
                            {checkOutTime && (
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] lg:text-sm text-slate-600 dark:text-slate-400">Check-out</span>
                                    <span className="text-[10px] lg:text-sm font-medium text-slate-900 dark:text-white">{checkOutTime}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Cancellation Policy */}
                {cancellationPolicies && (
                    <div className="space-y-1.5 lg:space-y-4">
                        <h3 className="text-[11px] lg:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 lg:gap-2">
                            {isRefundable ? (
                                <>
                                    <CheckCircle size={12} className="text-emerald-500 lg:hidden" />
                                    <CheckCircle size={18} className="text-emerald-500 hidden lg:block" />
                                </>
                            ) : (
                                <>
                                    <XCircle size={12} className="text-amber-500 lg:hidden" />
                                    <XCircle size={18} className="text-amber-500 hidden lg:block" />
                                </>
                            )}
                            Cancellation Policy
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 lg:p-4 space-y-1.5 lg:space-y-3">
                            <div className={`inline-flex items-center gap-1 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full text-[9px] lg:text-xs font-medium ${isRefundable
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>
                                {isRefundable ? 'Refundable' : 'Non-refundable'}
                            </div>

                            {cancellationPolicies.cancelPolicyInfos
                                ?.filter((p) => {
                                    const t = (p.type || '').toUpperCase();
                                    return !t.includes('NO_SHOW') && !t.includes('NOSHOW') && !t.includes('EARLY_DEPARTURE') && !t.includes('EARLY_CHECKOUT');
                                })
                                .map((policy, index) => (
                                    <div key={index} className="text-[10px] lg:text-sm text-slate-600 dark:text-slate-300">
                                        {policy.cancelTime && (
                                            <p>
                                                Cancel before <span className="font-medium">{formatCancellationTime(policy.cancelTime)}</span>
                                                {policy.amount !== undefined && policy.currency && (
                                                    <> - Fee: <span className="font-medium">{policy.currency} {policy.amount}</span></>
                                                )}
                                            </p>
                                        )}
                                    </div>
                                ))}

                            {/* No-Show Penalty */}
                            {noShowPenalty > 0 && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                    <AlertTriangle size={14} className="mt-0.5 text-orange-500 flex-shrink-0" />
                                    <p className="text-xs text-orange-700 dark:text-orange-300">
                                        <span className="font-medium">No-Show Penalty:</span>{' '}
                                        {formatFeeAmount(noShowPenalty, feeCurrency)} if you don&apos;t check in without cancelling.
                                    </p>
                                </div>
                            )}

                            {/* Early Departure Fee */}
                            {earlyDepartureFee > 0 && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                    <LogOut size={14} className="mt-0.5 text-orange-500 flex-shrink-0" />
                                    <p className="text-xs text-orange-700 dark:text-orange-300">
                                        <span className="font-medium">Early Departure Fee:</span>{' '}
                                        {formatFeeAmount(earlyDepartureFee, feeCurrency)} if you check out before your scheduled date.
                                    </p>
                                </div>
                            )}

                            {cancellationPolicies.hotelRemarks && (
                                <div
                                    className="text-xs text-slate-500 dark:text-slate-400 mt-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(cancellationPolicies.hotelRemarks) }}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Important Information */}
            {hotelImportantInformation && (
                <div className="mt-3 lg:mt-8 space-y-2 lg:space-y-4">
                    <h3 className="text-[11px] lg:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 lg:gap-2">
                        <Info size={12} className="lg:hidden" /><Info size={18} className="hidden lg:block" />
                        Important Information
                    </h3>
                    <div
                        className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 lg:p-4 text-[10px] lg:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(hotelImportantInformation) }}
                    />
                </div>
            )}
        </div>
    );
};

export default PoliciesSection;
