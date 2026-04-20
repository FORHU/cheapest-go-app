"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, PlaneTakeoff, AlertTriangle, ArrowRight, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NormalizedSegmentSeatMap, NormalizedSeat, SelectedSeat } from '@/types/seatMap';

interface SeatMapPanelProps {
    offerId: string;
    segments: { origin: string; destination: string }[];
    passengerCount: number;
    passengerLabels: string[];        // ["Passenger 1 (Adult)", ...]
    selectedSeats: SelectedSeat[];
    onSeatsChange: (seats: SelectedSeat[]) => void;
    currency: string;
    /** Called when seat map is unavailable so the parent can skip this step */
    onUnavailable?: () => void;
    /** Called when the user explicitly clicks "Done" or "Skip" */
    onDone?: () => void;
}

export default function SeatMapPanel({
    offerId,
    segments,
    passengerCount,
    passengerLabels,
    selectedSeats,
    onSeatsChange,
    currency,
    onUnavailable,
    onDone,
}: SeatMapPanelProps) {
    const [seatMaps, setSeatMaps] = useState<NormalizedSegmentSeatMap[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSegment, setActiveSegment] = useState(0);
    const [activePassenger, setActivePassenger] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        fetch('/api/flights/seat-map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offerId, segments }),
        })
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                if (!data.success) throw new Error(data.error || 'Failed to load seat map');
                const maps = data.seatMaps ?? [];
                setSeatMaps(maps);
                if (maps.length === 0 && onUnavailable) onUnavailable();
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

    const getSelected = useCallback(
        (segIdx: number, paxIdx: number) =>
            selectedSeats.find(s => s.segmentIndex === segIdx && s.passengerIndex === paxIdx),
        [selectedSeats]
    );

    const isOccupiedByOther = useCallback(
        (segIdx: number, paxIdx: number, designator: string) =>
            selectedSeats.some(
                s => s.segmentIndex === segIdx && s.passengerIndex !== paxIdx && s.designator === designator
            ),
        [selectedSeats]
    );

    const handleSeatClick = useCallback(
        (seat: NormalizedSeat, segIdx: number, paxIdx: number) => {
            if (seat.status !== 'available' || seat.serviceId === null) return;
            if (isOccupiedByOther(segIdx, paxIdx, seat.designator)) return;

            const existing = getSelected(segIdx, paxIdx);

            let nextSeats: SelectedSeat[];
            if (existing?.designator === seat.designator) {
                // Deselect
                nextSeats = selectedSeats.filter(
                    s => !(s.segmentIndex === segIdx && s.passengerIndex === paxIdx)
                );
            } else {
                // Replace or add
                nextSeats = [
                    ...selectedSeats.filter(s => !(s.segmentIndex === segIdx && s.passengerIndex === paxIdx)),
                    {
                        passengerIndex: paxIdx,
                        segmentIndex: segIdx,
                        designator: seat.designator,
                        serviceId: seat.serviceId,
                        price: seat.price ?? 0,
                        currency: seat.currency,
                    },
                ];
            }

            onSeatsChange(nextSeats);

            // Auto-advance to next passenger who hasn't picked a seat on this segment
            if (existing?.designator !== seat.designator) {
                const nextPax = [...Array(passengerCount).keys()]
                    .find(i => i !== paxIdx && !nextSeats.find(s => s.segmentIndex === segIdx && s.passengerIndex === i));
                if (nextPax !== undefined) {
                    setActivePassenger(nextPax);
                }
            }
        },
        [selectedSeats, onSeatsChange, getSelected, isOccupiedByOther, passengerCount]
    );

    const totalSeatCost = selectedSeats.reduce((sum, s) => sum + s.price, 0);

    // How many seats have been selected across all segments × passengers
    const totalRequired = seatMaps.length * passengerCount;
    const totalSelected = seatMaps.reduce((acc, sm) =>
        acc + [...Array(passengerCount).keys()].filter(pi =>
            selectedSeats.some(s => s.segmentIndex === sm.segmentIndex && s.passengerIndex === pi)
        ).length, 0);
    const allSeatsChosen = totalSelected === totalRequired && totalRequired > 0;

    // ── Loading / Error ──────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500 dark:text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading seat map…
            </div>
        );
    }

    if (error || seatMaps.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Seat map not available</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        This airline doesn't support seat selection for this flight through our booking system.
                    </p>
                </div>
            </div>
        );
    }

    const currentMap = seatMaps[activeSegment];
    if (!currentMap) return null;

    return (
        <div className="space-y-3">
            {/* Progress bar */}
            {totalRequired > 1 && (
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                            style={{ width: `${(totalSelected / totalRequired) * 100}%` }}
                        />
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        {totalSelected}/{totalRequired} seats
                    </span>
                </div>
            )}

            {/* Segment tabs */}
            {seatMaps.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                    {seatMaps.map((sm, i) => {
                        const segSeats = [...Array(passengerCount).keys()].filter(pi =>
                            selectedSeats.some(s => s.segmentIndex === sm.segmentIndex && s.passengerIndex === pi)
                        ).length;
                        const segDone = segSeats === passengerCount;
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => { setActiveSegment(i); setActivePassenger(0); }}
                                className={cn(
                                    'flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap border transition-colors shrink-0',
                                    activeSegment === i
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                                )}
                            >
                                <PlaneTakeoff className="w-3 h-3" />
                                {sm.origin} <ArrowRight className="w-2.5 h-2.5" /> {sm.destination}
                                {segDone && <Check className="w-3 h-3 ml-0.5 text-emerald-400" />}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Passenger tabs */}
            {passengerCount > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                    {passengerLabels.map((label, i) => {
                        const chosen = getSelected(activeSegment, i);
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setActivePassenger(i)}
                                className={cn(
                                    'flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap border transition-colors shrink-0',
                                    activePassenger === i
                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                                        : chosen
                                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                )}
                            >
                                {label.split(' ').slice(0, 2).join(' ')}
                                {chosen
                                    ? <span className="ml-1 font-bold">{chosen.designator}</span>
                                    : <span className="ml-1 text-slate-300 dark:text-slate-600">—</span>
                                }
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Current selection hint */}
            {passengerCount === 1 ? (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {getSelected(activeSegment, 0)
                        ? `Seat ${getSelected(activeSegment, 0)!.designator} selected`
                        : 'Tap a seat to select it'}
                </p>
            ) : (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Selecting for{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {passengerLabels[activePassenger]?.split(' ').slice(0, 2).join(' ')}
                    </span>
                    {getSelected(activeSegment, activePassenger)
                        ? ` · Seat ${getSelected(activeSegment, activePassenger)!.designator} chosen`
                        : ' · tap a seat below'}
                </p>
            )}

            {/* Cabin grid */}
            <CabinGrid
                map={currentMap}
                passengerIndex={activePassenger}
                segmentIndex={activeSegment}
                selectedSeats={selectedSeats}
                onSeatClick={handleSeatClick}
            />

            {/* Legend */}
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[10px] text-slate-500 dark:text-slate-400">
                <LegendItem color="bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700" label="Free" />
                <LegendItem color="bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700" label="Paid" />
                <LegendItem color="bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 opacity-60" label="Taken" />
                <LegendItem color="bg-indigo-500 border-indigo-500" label="Selected" textColor="text-indigo-600 dark:text-indigo-400" />
                <LegendItem color="bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 ring-1 ring-offset-1 ring-blue-400" label="Extra legroom" />
                <LegendItem color="bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 ring-1 ring-offset-1 ring-orange-400" label="Exit row" />
            </div>

            {/* Seat cost summary + Done/Skip */}
            <div className="flex items-center gap-2">
                {totalSeatCost > 0 && (
                    <div className="flex-1 flex items-center justify-between text-xs bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2">
                        <span className="text-indigo-700 dark:text-indigo-300 font-medium">Seat upgrade</span>
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">
                            +{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(totalSeatCost)}
                        </span>
                    </div>
                )}
                <div className={cn('flex gap-2', totalSeatCost === 0 && 'w-full')}>
                    {selectedSeats.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onSeatsChange([])}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <X className="w-3 h-3" />
                            Clear
                        </button>
                    )}
                    {onDone && (
                        <button
                            type="button"
                            onClick={onDone}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold transition-colors',
                                allSeatsChosen
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700',
                                totalSeatCost === 0 && 'flex-1 justify-center'
                            )}
                        >
                            {allSeatsChosen ? <Check className="w-3.5 h-3.5" /> : null}
                            {allSeatsChosen ? 'Done' : 'Skip'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Cabin Grid ──────────────────────────────────────────────────────

interface CabinGridProps {
    map: NormalizedSegmentSeatMap;
    passengerIndex: number;
    segmentIndex: number;
    selectedSeats: SelectedSeat[];
    onSeatClick: (seat: NormalizedSeat, segIdx: number, paxIdx: number) => void;
}

function CabinGrid({ map, passengerIndex, segmentIndex, selectedSeats, onSeatClick }: CabinGridProps) {
    return (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-auto max-h-[380px]">
            {/* Cabin class label + column headers */}
            <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                {map.cabinClass && (
                    <div className="px-3 pt-1.5 pb-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            {map.cabinClass.replace(/_/g, ' ')}
                        </span>
                    </div>
                )}
                <div className="px-3 py-1.5">
                    <div className="flex items-center gap-3">
                        <span className="w-7 shrink-0" />
                        {map.columnHeaders.map((section, si) => (
                            <React.Fragment key={si}>
                                {si > 0 && <span className="w-4 shrink-0" />}
                                <div className="flex gap-1">
                                    {section.map(col => (
                                        <span key={col} className="w-7 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                            {col}
                                        </span>
                                    ))}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>

            {/* Rows */}
            <div className="px-3 py-2 space-y-1">
                {map.rows.map(row => (
                    <div key={row.rowNumber} className="flex items-center gap-3">
                        {/* Row number */}
                        <span className="w-7 shrink-0 text-right text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            {row.rowNumber}
                        </span>

                        {row.sections.map((section, si) => (
                            <React.Fragment key={si}>
                                {si > 0 && <span className="w-4 shrink-0" />}
                                <div className="flex gap-1">
                                    {section.map((seat, seatIdx) => (
                                        <SeatButton
                                            key={seatIdx}
                                            seat={seat}
                                            passengerIndex={passengerIndex}
                                            segmentIndex={segmentIndex}
                                            selectedSeats={selectedSeats}
                                            onClick={() => onSeatClick(seat, segmentIndex, passengerIndex)}
                                        />
                                    ))}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Seat Button ─────────────────────────────────────────────────────

interface SeatButtonProps {
    seat: NormalizedSeat;
    passengerIndex: number;
    segmentIndex: number;
    selectedSeats: SelectedSeat[];
    onClick: () => void;
}

function SeatButton({ seat, passengerIndex, segmentIndex, selectedSeats, onClick }: SeatButtonProps) {
    if (seat.elementType !== 'seat') {
        return <span className="w-7 h-7 shrink-0" />;
    }

    const isSelected = selectedSeats.some(
        s => s.segmentIndex === segmentIndex && s.passengerIndex === passengerIndex && s.designator === seat.designator
    );
    const takenByOther = selectedSeats.some(
        s => s.segmentIndex === segmentIndex && s.passengerIndex !== passengerIndex && s.designator === seat.designator
    );
    const isOccupied = seat.status === 'occupied' || takenByOther;
    const isFree = seat.price === null || seat.price === 0;
    const isPaid = !isFree && seat.price !== null && seat.price > 0;
    const isAvailable = seat.status === 'available' && !takenByOther;

    const priceLabel = isPaid
        ? `${seat.designator} · ${new Intl.NumberFormat('en-US', { style: 'currency', currency: seat.currency }).format(seat.price!)}`
        : seat.designator;
    const tooltip = [
        priceLabel,
        seat.extraLegroom ? '✦ Extra legroom' : '',
        seat.isExit ? '⚠ Exit row' : '',
    ].filter(Boolean).join('\n');

    return (
        <button
            type="button"
            title={tooltip}
            disabled={isOccupied || !isAvailable}
            onClick={onClick}
            className={cn(
                'w-7 h-7 shrink-0 rounded text-[9px] font-bold border transition-all',
                isSelected
                    ? 'bg-indigo-500 border-indigo-500 text-white shadow-sm scale-110'
                    : isOccupied
                        ? 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-60'
                        : isFree
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 cursor-pointer active:scale-95'
                            : 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-200 cursor-pointer active:scale-95',
                seat.extraLegroom && !isSelected && 'ring-1 ring-offset-1 ring-blue-400',
                seat.isExit && !isSelected && !seat.extraLegroom && 'ring-1 ring-offset-1 ring-orange-400',
            )}
        >
            {seat.designator.replace(/^\d+/, '')}
        </button>
    );
}

// ─── Legend item ─────────────────────────────────────────────────────

function LegendItem({ color, label, textColor }: { color: string; label: string; textColor?: string }) {
    return (
        <div className="flex items-center gap-1">
            <span className={cn('w-4 h-4 rounded border shrink-0', color)} />
            <span className={cn('text-slate-500 dark:text-slate-400', textColor)}>{label}</span>
        </div>
    );
}
