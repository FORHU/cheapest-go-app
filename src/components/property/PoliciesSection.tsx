"use client";

import React from 'react';
import { Clock, Info, XCircle, CheckCircle } from 'lucide-react';

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

    return (
        <div className="py-8 border-t border-slate-200 dark:border-white/10 scroll-mt-36" id="policies">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Policies</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Check-in / Check-out */}
                {(checkInTime || checkOutTime) && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Clock size={18} />
                            Check-in & Check-out
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-3">
                            {checkInTime && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Check-in</span>
                                    <span className="text-sm font-medium text-slate-900 dark:text-white">{checkInTime}</span>
                                </div>
                            )}
                            {checkOutTime && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Check-out</span>
                                    <span className="text-sm font-medium text-slate-900 dark:text-white">{checkOutTime}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Cancellation Policy */}
                {cancellationPolicies && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {isRefundable ? (
                                <CheckCircle size={18} className="text-emerald-500" />
                            ) : (
                                <XCircle size={18} className="text-amber-500" />
                            )}
                            Cancellation Policy
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-3">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                isRefundable
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                                {isRefundable ? 'Refundable' : 'Non-refundable'}
                            </div>

                            {cancellationPolicies.cancelPolicyInfos?.map((policy, index) => (
                                <div key={index} className="text-sm text-slate-600 dark:text-slate-300">
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

                            {cancellationPolicies.hotelRemarks && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                    {cancellationPolicies.hotelRemarks}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Important Information */}
            {hotelImportantInformation && (
                <div className="mt-8 space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Info size={18} />
                        Important Information
                    </h3>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">
                            {hotelImportantInformation}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PoliciesSection;
