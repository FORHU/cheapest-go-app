"use client";

import React, { useState, useEffect } from 'react';
import { User, Bed, Square, X, Check } from 'lucide-react';
import { getCurrencySymbol, convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

/**
 * Format cancellation deadline for display
 * Example: "Thu, Feb 5, 1:58 AM"
 */
function formatCancellationDeadline(deadline?: string): string | null {
    if (!deadline) return null;
    try {
        const date = new Date(deadline);
        if (isNaN(date.getTime())) return null;
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return null;
    }
}

/** Rate option for a room */
export interface RateOption {
    offerId: string;
    price: number;
    currency: string;
    boardType?: string;
    boardName?: string;
    refundable: boolean;
    cancellationDeadline?: string;
}

export interface RoomCardProps {
    /** Room title/name */
    title: string;
    /** Price per night (lowest rate) */
    price: number;
    /** Currency code */
    currency?: string;
    /** Maximum occupancy */
    maxOccupancy?: number;
    /** Bed type description */
    bedType?: string;
    /** Room size */
    roomSize?: string;
    /** Whether free cancellation is available (for primary rate) */
    freeCancellation?: boolean;
    /** Room image URL */
    roomImage?: string;
    /** Room description */
    description?: string;
    /** List of amenities */
    amenities?: (string | { name: string })[];
    /** Number of photos available */
    photoCount?: number;
    /** Handler for reserve/book action - receives offerId */
    onReserve: (offerId?: string) => void;
    /** Handler for viewing room details */
    onViewDetails: () => void;
    /** Multiple rate options for this room (optional) */
    rateOptions?: RateOption[];
}

/**
 * RoomCard component
 * Displays room information with pricing and booking actions
 * Used in property detail pages and room selection flows
 *
 * @example
 * <RoomCard
 *   title="Deluxe King Room"
 *   price={5200}
 *   currency="PHP"
 *   maxOccupancy={2}
 *   bedType="King Bed"
 *   roomSize="32 m²"
 *   freeCancellation={true}
 *   roomImage="/room.jpg"
 *   amenities={['Free WiFi', 'Air Conditioning', 'Minibar']}
 *   photoCount={5}
 *   onReserve={() => handleReserve()}
 *   onViewDetails={() => handleViewDetails()}
 * />
 */
export const RoomCard: React.FC<RoomCardProps> = ({
    title,
    price,
    currency = 'PHP',
    maxOccupancy,
    bedType,
    roomSize,
    freeCancellation,
    roomImage,
    amenities,
    photoCount,
    onReserve,
    onViewDetails,
    rateOptions = []
}) => {
    const [selectedRateIdx, setSelectedRateIdx] = useState(0);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const targetCurrency = useUserCurrency();
    const sourceCurrency = currency || 'KRW';

    const hasMultipleRates = rateOptions.length > 1;
    const selectedRate = rateOptions[selectedRateIdx];

    const basePriceConverted = mounted ? convertCurrency(price, sourceCurrency, targetCurrency) : price;
    const selectedRatePriceConverted = selectedRate
        ? (mounted ? convertCurrency(selectedRate.price, selectedRate.currency || sourceCurrency, targetCurrency) : selectedRate.price)
        : undefined;

    const displayPrice = selectedRatePriceConverted ?? basePriceConverted;
    const currencySymbol = getCurrencySymbol(mounted ? targetCurrency : sourceCurrency);
    const displayRefundable = selectedRate?.refundable ?? freeCancellation;
    const displayOfferId = selectedRate?.offerId;

    return (
        <div className="flex flex-row bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition-all group">
            {/* Left: Image (Horizontal layout on mobile, like search results) */}
            <div
                className="w-[110px] lg:w-[240px] relative h-auto cursor-pointer p-2 lg:p-3 pr-0 lg:pr-0 flex-shrink-0"
                onClick={onViewDetails}
            >
                {roomImage ? (
                    <div
                        className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105 rounded-xl overflow-hidden shadow-sm"
                        style={{ backgroundImage: `url(${roomImage})` }}
                    />
                ) : (
                    <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600 rounded-xl">
                        <Bed size={32} />
                    </div>
                )}
                {/* Image Counter Badge */}
                {photoCount && photoCount > 1 && (
                    <div className="hidden lg:flex absolute bottom-3 lg:bottom-5 right-1 lg:right-3 bg-black/60 text-white text-[9px] lg:text-xs px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-md items-center gap-1 backdrop-blur-sm z-10">
                        <span>1/{photoCount}</span>
                        <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-white rounded-full ml-1 lg:ml-1" />
                    </div>
                )}

            </div>

            {/* Middle: Info & Rate Options */}
            <div className="flex-1 p-2 lg:p-4 flex flex-col justify-between min-w-0">
                <div>
                    <h4 className="text-[13px] lg:text-lg font-bold text-slate-900 dark:text-white line-clamp-2 mb-0.5 lg:mb-1 group-hover:text-blue-600 transition-colors">
                        {title}
                    </h4>

                    {/* Compact Room Specs */}
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] lg:text-xs text-slate-500 dark:text-slate-400 mb-2 lg:mb-3">
                        {roomSize && <span className="flex items-center gap-1"><Square size={9} /> {roomSize}</span>}
                        <span className="flex items-center gap-1"><User size={9} /> Sleeps {maxOccupancy || 2}</span>
                        {bedType && <span className="flex items-center gap-1"><Bed size={9} /> {bedType}</span>}
                    </div>

                    {/* Rate Options (if multiple) */}
                    {hasMultipleRates ? (
                        <div className="space-y-1 mb-1 lg:mb-4">
                            <div className="text-[9px] lg:text-xs font-bold text-slate-900 dark:text-white mb-0.5 mt-1.5 lg:mt-2">
                                {rateOptions.length} rate options
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                                {rateOptions.map((rate, idx) => (
                                    <label
                                        key={rate.offerId}
                                        className={`flex items-center justify-between p-1 LG:p-2 rounded-lg cursor-pointer border transition-all ${selectedRateIdx === idx
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                            }`}
                                    >
                                        <div className="flex items-center gap-1 min-w-0 flex-1">
                                            <input
                                                type="radio"
                                                name={`rate-${title}`}
                                                checked={selectedRateIdx === idx}
                                                onChange={() => setSelectedRateIdx(idx)}
                                                className="w-2.5 h-2.5 text-blue-600 cursor-pointer shrink-0"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] lg:text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                                    {rate.boardName || 'Room only'}
                                                </div>
                                                <div className={`text-[8px] lg:text-[11px] font-medium leading-tight truncate ${rate.refundable ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                    {rate.refundable ? 'Free cancellation' : 'Non-refundable'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-[10px] lg:text-sm font-bold text-slate-900 dark:text-white ml-2 text-right shrink-0 whitespace-nowrap">
                                            {currencySymbol}{convertCurrency(rate.price, rate.currency || sourceCurrency, targetCurrency).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                            <div className="text-[8px] text-slate-500 font-normal">/night</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 lg:p-2.5 border border-slate-100 dark:border-slate-700">
                            <div className="font-bold text-[10px] lg:text-sm text-slate-900 dark:text-white mb-0.5 lg:mb-1">
                                Room only
                            </div>
                            <div className="space-y-1">
                                <div className="text-[9px] lg:text-xs text-slate-500 flex items-center gap-1.5">
                                    <X size={10} className="text-slate-400" /> No meals included
                                </div>
                                {displayRefundable ? (
                                    <div className="text-[9px] lg:text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                                        <Check size={10} /> Free cancellation
                                    </div>
                                ) : (
                                    <div className="text-[9px] lg:text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full border border-amber-400 dark:border-amber-500 flex items-center justify-center text-[7px] text-amber-500">
                                            i
                                        </div>
                                        Non-Refundable
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mt-2 lg:mt-3 gap-2">
                    <div className="flex flex-col min-w-0">
                        <button
                            onClick={onViewDetails}
                            className="text-[10px] lg:text-xs text-blue-600 font-bold hover:underline self-start mb-0.5 lg:mb-0"
                        >
                            Room details
                        </button>
                        {/* Hide price on mobile if multiple rates since it's already shown on the radio button */}
                        {!hasMultipleRates && (
                            <div className="lg:hidden mt-0.5">
                                <div className="flex items-baseline gap-0.5 flex-wrap">
                                    <span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 leading-none whitespace-nowrap">
                                        {currencySymbol}{displayPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </span>
                                    <span className="text-[9px] text-slate-500 whitespace-nowrap">/night</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mobile Action Button */}
                    <button
                        onClick={() => onReserve(displayOfferId)}
                        className="lg:hidden bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-2.5 rounded-lg text-[11px] shadow-sm shrink-0"
                    >
                        Choose
                    </button>
                </div>
            </div>

            {/* Right: Pricing & Action (Desktop Sidebar) */}
            <div className={`p-3 lg:p-4 hidden lg:flex lg:flex-col justify-between lg:items-end bg-slate-50/50 dark:bg-white/5 lg:min-w-[180px] border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-white/5 shrink-0`}>
                <div className="text-right hidden lg:block">
                    <div className="flex items-baseline justify-end gap-1">
                        <span className="text-[18px] font-bold text-slate-900 dark:text-white leading-none">
                            {currencySymbol}{displayPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[12px] text-slate-500">/night</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2">
                        (1 night, 1 Room incl. taxes)
                    </div>
                </div>

                <div className="w-full h-full lg:h-auto flex items-end">
                    <button
                        onClick={() => onReserve(displayOfferId)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-[13px] lg:text-sm transition-colors w-full focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        Choose room
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RoomCard;
