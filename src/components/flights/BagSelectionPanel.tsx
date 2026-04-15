"use client";

import React, { useEffect, useState } from 'react';
import { Loader2, Luggage, ShoppingBag, AlertTriangle, Plus, Minus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NormalizedBagOption, SelectedBag } from '@/types/bags';

interface BagSelectionPanelProps {
    offerId: string;
    /** rawOffer.passengers[i].id — used to map Duffel passenger IDs to indices */
    duffelPassengerIds: string[];
    passengerCount: number;
    passengerLabels: string[];
    selectedBags: SelectedBag[];
    onBagsChange: (bags: SelectedBag[]) => void;
    currency: string;
    /** Called when no bag services are available so the parent can skip */
    onUnavailable?: () => void;
}

export default function BagSelectionPanel({
    offerId,
    duffelPassengerIds,
    passengerCount,
    passengerLabels,
    selectedBags,
    onBagsChange,
    currency,
    onUnavailable,
}: BagSelectionPanelProps) {
    const [options, setOptions] = useState<NormalizedBagOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        fetch('/api/flights/bags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offerId, duffelPassengerIds }),
        })
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                if (!data.success) throw new Error(data.error || 'Failed to load bag options');
                const opts: NormalizedBagOption[] = data.bagOptions ?? [];
                setOptions(opts);
                if (opts.length === 0 && onUnavailable) onUnavailable();
            })
            .catch(err => {
                if (!cancelled) {
                    setError(err.message);
                    if (onUnavailable) onUnavailable();
                }
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [offerId]); // eslint-disable-line react-hooks/exhaustive-deps

    const isSelected = (serviceId: string, paxIdx: number) =>
        selectedBags.some(b => b.serviceId === serviceId && b.passengerIndex === paxIdx);

    const toggle = (opt: NormalizedBagOption) => {
        if (isSelected(opt.serviceId, opt.passengerIndex)) {
            onBagsChange(selectedBags.filter(
                b => !(b.serviceId === opt.serviceId && b.passengerIndex === opt.passengerIndex)
            ));
        } else {
            onBagsChange([...selectedBags, {
                serviceId: opt.serviceId,
                passengerIndex: opt.passengerIndex,
                bagType: opt.bagType,
                price: opt.price,
                currency: opt.currency,
            }]);
        }
    };

    const totalBagCost = selectedBags.reduce((sum, b) => sum + b.price, 0);

    // ── Loading ──
    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500 dark:text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading bag options…
            </div>
        );
    }

    // ── Unavailable ──
    if (error || options.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Bag upgrades not available</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Extra bag selection isn't supported for this flight.
                    </p>
                </div>
            </div>
        );
    }

    // Group options by passenger, then by bag type
    const byPassenger = Array.from({ length: passengerCount }, (_, i) => ({
        label: passengerLabels[i] ?? `Passenger ${i + 1}`,
        passengerIndex: i,
        checked: options.filter(o => o.passengerIndex === i && o.bagType === 'checked'),
        carryOn: options.filter(o => o.passengerIndex === i && o.bagType === 'carry_on'),
    })).filter(p => p.checked.length > 0 || p.carryOn.length > 0);

    return (
        <div className="space-y-3">
            {byPassenger.map(pax => (
                <PassengerBagRow
                    key={pax.passengerIndex}
                    label={pax.label}
                    showLabel={passengerCount > 1}
                    checkedOptions={pax.checked}
                    carryOnOptions={pax.carryOn}
                    selectedBags={selectedBags}
                    onToggle={toggle}
                    currency={currency}
                />
            ))}

            {/* Cost summary */}
            {totalBagCost > 0 && (
                <div className="flex items-center justify-between text-xs bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg px-3 py-2">
                    <span className="text-sky-700 dark:text-sky-300 font-medium">Bag upgrade total</span>
                    <span className="font-bold text-sky-700 dark:text-sky-300">
                        +{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(totalBagCost)}
                    </span>
                </div>
            )}
        </div>
    );
}

// ─── Passenger bag row ───────────────────────────────────────────────

interface PassengerBagRowProps {
    label: string;
    showLabel: boolean;
    checkedOptions: NormalizedBagOption[];
    carryOnOptions: NormalizedBagOption[];
    selectedBags: SelectedBag[];
    onToggle: (opt: NormalizedBagOption) => void;
    currency: string;
}

function PassengerBagRow({
    label,
    showLabel,
    checkedOptions,
    carryOnOptions,
    selectedBags,
    onToggle,
    currency,
}: PassengerBagRowProps) {
    return (
        <div className="space-y-2">
            {showLabel && (
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-0.5">
                    {label}
                </p>
            )}
            <div className="space-y-1.5">
                {carryOnOptions.map(opt => (
                    <BagOptionCard
                        key={`${opt.serviceId}-${opt.passengerIndex}-carry`}
                        opt={opt}
                        selected={selectedBags.some(b => b.serviceId === opt.serviceId && b.passengerIndex === opt.passengerIndex)}
                        onToggle={onToggle}
                        currency={currency}
                    />
                ))}
                {checkedOptions.map(opt => (
                    <BagOptionCard
                        key={`${opt.serviceId}-${opt.passengerIndex}-checked`}
                        opt={opt}
                        selected={selectedBags.some(b => b.serviceId === opt.serviceId && b.passengerIndex === opt.passengerIndex)}
                        onToggle={onToggle}
                        currency={currency}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Single bag option card ──────────────────────────────────────────

interface BagOptionCardProps {
    opt: NormalizedBagOption;
    selected: boolean;
    onToggle: (opt: NormalizedBagOption) => void;
    currency: string;
}

function BagOptionCard({ opt, selected, onToggle, currency }: BagOptionCardProps) {
    const Icon = opt.bagType === 'carry_on' ? ShoppingBag : Luggage;
    const label = opt.bagType === 'carry_on' ? 'Carry-on bag' : 'Checked bag';
    const weightLabel = opt.weightKg != null ? `up to ${opt.weightKg} kg` : null;
    const priceLabel = opt.price === 0
        ? 'Free'
        : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(opt.price);

    return (
        <button
            type="button"
            onClick={() => onToggle(opt)}
            className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                selected
                    ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-400 dark:border-sky-600 ring-1 ring-sky-400/50'
                    : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500',
            )}
        >
            <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                selected
                    ? 'bg-sky-100 dark:bg-sky-900/50'
                    : 'bg-slate-100 dark:bg-slate-700',
            )}>
                <Icon className={cn(
                    'w-4 h-4',
                    selected ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400',
                )} />
            </div>

            <div className="flex-1 min-w-0">
                <p className={cn(
                    'text-[12px] font-semibold',
                    selected ? 'text-sky-700 dark:text-sky-300' : 'text-slate-800 dark:text-slate-200',
                )}>
                    {label}
                </p>
                {weightLabel && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{weightLabel}</p>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <span className={cn(
                    'text-[12px] font-bold',
                    selected ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300',
                )}>
                    {priceLabel}
                </span>
                <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                    selected
                        ? 'bg-sky-500 border-sky-500'
                        : 'border-slate-300 dark:border-slate-500',
                )}>
                    {selected
                        ? <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        : <Plus className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                    }
                </div>
            </div>
        </button>
    );
}
