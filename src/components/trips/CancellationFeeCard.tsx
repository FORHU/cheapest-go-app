"use client";

import React from 'react';
import { DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { CancellationFeeResult } from '@/lib/cancellation';

interface CancellationFeeCardProps {
    feeResult: CancellationFeeResult;
}

export function CancellationFeeCard({ feeResult }: CancellationFeeCardProps) {
    return (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-5">
            <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-900 dark:text-blue-100">
                    If you cancel now:
                </span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Cancellation Fee</p>
                    <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                        {formatCurrency(feeResult.fee, feeResult.currency)}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-green-600 dark:text-green-400 mb-1">You'll Receive</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                        {formatCurrency(feeResult.refund, feeResult.currency)}
                    </p>
                </div>
            </div>
        </div>
    );
}
