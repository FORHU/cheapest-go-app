"use client";

import React from 'react';
import { CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DuffelCondition {
    allowed: boolean;
    penalty_amount: string | null;
    penalty_currency: string | null;
}

interface DuffelConditions {
    change_before_departure?: DuffelCondition;
    change_after_departure?: DuffelCondition;
    refund_before_departure?: DuffelCondition;
    refund_after_departure?: DuffelCondition;
}

interface DuffelFareConditionsProps {
    rawOffer: any;
    currency?: string;
}

function penaltyLabel(cond: DuffelCondition, currency: string): string {
    if (!cond.allowed) return 'Not allowed';
    if (cond.penalty_amount === null) return 'Allowed (fee may apply)';
    const amt = parseFloat(cond.penalty_amount ?? '0');
    if (amt === 0) return 'Free';
    return `Allowed · ${new Intl.NumberFormat('en-US', { style: 'currency', currency: cond.penalty_currency ?? currency }).format(amt)} fee`;
}

function ConditionRow({ label, cond, currency }: { label: string; cond: DuffelCondition | undefined; currency: string }) {
    if (!cond) return null;
    const Icon = cond.allowed
        ? (parseFloat(cond.penalty_amount ?? '0') === 0 && cond.penalty_amount !== null)
            ? CheckCircle
            : AlertCircle
        : XCircle;
    const color = cond.allowed
        ? (parseFloat(cond.penalty_amount ?? '0') === 0 && cond.penalty_amount !== null)
            ? 'text-emerald-500'
            : 'text-amber-500'
        : 'text-red-500';

    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
            <div className="flex items-center gap-1.5 shrink-0">
                <Icon className={cn('w-3.5 h-3.5', color)} />
                <span className={cn('text-xs font-medium', color)}>
                    {penaltyLabel(cond, currency)}
                </span>
            </div>
        </div>
    );
}

export default function DuffelFareConditions({ rawOffer, currency = 'USD' }: DuffelFareConditionsProps) {
    const [open, setOpen] = React.useState(false);

    const conds: DuffelConditions | null = rawOffer?.conditions ?? null;
    if (!conds) return null;

    // Only show if at least one condition is present
    const hasAny = conds.change_before_departure || conds.refund_before_departure
        || conds.change_after_departure || conds.refund_after_departure;
    if (!hasAny) return null;

    const offerCurrency = rawOffer?.total_currency ?? currency;

    // Determine overall badge
    const refundBefore = conds.refund_before_departure;
    const isFullyRefundable = refundBefore?.allowed && (refundBefore.penalty_amount === '0.00' || refundBefore.penalty_amount === '0');
    const isNonRefundable = !refundBefore?.allowed;

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-3.5 py-3 text-left"
            >
                <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">Fare Conditions</span>
                    {isFullyRefundable ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-medium">Fully refundable</span>
                    ) : isNonRefundable ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 font-medium">Non-refundable</span>
                    ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">Partial refund</span>
                    )}
                </div>
                {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {open && (
                <div className="px-3.5 pb-3.5 border-t border-slate-100 dark:border-slate-800 pt-2.5 divide-y divide-slate-100 dark:divide-slate-800">
                    <ConditionRow label="Change before departure" cond={conds.change_before_departure} currency={offerCurrency} />
                    <ConditionRow label="Change after departure" cond={conds.change_after_departure} currency={offerCurrency} />
                    <ConditionRow label="Refund before departure" cond={conds.refund_before_departure} currency={offerCurrency} />
                    <ConditionRow label="Refund after departure" cond={conds.refund_after_departure} currency={offerCurrency} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-2">
                        Conditions are per passenger and subject to airline policy. Penalties apply per ticket.
                    </p>
                </div>
            )}
        </div>
    );
}
