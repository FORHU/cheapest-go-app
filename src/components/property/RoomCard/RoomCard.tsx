"use client";

import React, { useState } from 'react';
import { User, Bed, Square, X, Check } from 'lucide-react';

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
    const currencySymbol = currency === 'PHP' ? '₱' : currency;

    // Use rate options if provided, otherwise use single price
    const hasMultipleRates = rateOptions.length > 1;
    const selectedRate = rateOptions[selectedRateIdx];
    const displayPrice = selectedRate?.price ?? price;
    const displayRefundable = selectedRate?.refundable ?? freeCancellation;
    const displayOfferId = selectedRate?.offerId;

    return (
        <div className="border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 overflow-hidden hover:shadow-md transition-shadow">
            {/* Header: Title */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5">
                <h4 className="text-lg font-bold text-slate-900 dark:text-white line-clamp-1">
                    {title}
                </h4>
            </div>

            <div className="flex flex-col md:flex-row">
                {/* Left: Image */}
                <div
                    className="w-full md:w-1/3 md:max-w-[300px] h-48 md:h-auto relative cursor-pointer group"
                    onClick={onViewDetails}
                >
                    {roomImage ? (
                        <div
                            className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                            style={{ backgroundImage: `url(${roomImage})` }}
                        />
                    ) : (
                        <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600">
                            <Bed size={40} />
                        </div>
                    )}
                    {/* Image Counter Badge */}
                    {photoCount && photoCount > 1 && (
                        <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm">
                            <span>1/{photoCount}</span>
                            <div className="w-2 h-2 bg-white rounded-full ml-1" />
                        </div>
                    )}
                </div>

                {/* Middle: Info & Rate Options */}
                <div className="flex-1 p-4 border-r border-slate-100 dark:border-white/5 flex flex-col justify-between">
                    {/* Rate Options (if multiple) */}
                    {hasMultipleRates ? (
                        <div className="space-y-2 mb-4">
                            <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                                {rateOptions.length} rate options available
                            </div>
                            <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                {rateOptions.map((rate, idx) => (
                                    <label
                                        key={rate.offerId}
                                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-all ${
                                            selectedRateIdx === idx
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name={`rate-${title}`}
                                                checked={selectedRateIdx === idx}
                                                onChange={() => setSelectedRateIdx(idx)}
                                                className="w-3.5 h-3.5 text-blue-600"
                                            />
                                            <div>
                                                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                                    {rate.boardName || 'Room only'}
                                                </div>
                                                <div className={`text-[10px] ${rate.refundable ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                    {rate.refundable ? 'Free cancellation' : 'Non-refundable'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                                            {currencySymbol}{rate.price.toLocaleString()}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="font-bold text-sm text-slate-900 dark:text-white mb-2">
                                Room only
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                    <X size={12} className="text-slate-400" /> No meals included
                                </div>
                                {displayRefundable ? (
                                    <div className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                                        <Check size={12} /> Free cancellation
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-full border border-slate-300 flex items-center justify-center text-[8px]">
                                            i
                                        </div>
                                        Non-Refundable
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Room Details */}
                    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-white/5">
                        <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                            Room details
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                            {roomSize && (
                                <div className="flex items-center gap-1.5">
                                    <Square size={12} /> {roomSize}
                                </div>
                            )}
                            <div className="flex items-center gap-1.5">
                                <User size={12} /> Sleeps {maxOccupancy || 2}
                            </div>
                            {bedType && (
                                <div className="flex items-center gap-1.5">
                                    <Bed size={12} /> {bedType}
                                </div>
                            )}
                        </div>

                        <div className="text-xs font-bold text-slate-900 dark:text-white mt-3 mb-1">
                            Amenities
                        </div>
                        <div className="space-y-1">
                            {(amenities || []).slice(0, 3).map((am, i) => {
                                const name = typeof am === 'string' ? am : am.name;
                                return (
                                    <div
                                        key={i}
                                        className="text-xs text-slate-500 flex items-center gap-1.5"
                                    >
                                        <Check size={10} className="text-slate-300" /> {name}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        onClick={onViewDetails}
                        className="text-xs text-blue-600 font-bold mt-3 hover:underline"
                    >
                        Room details
                    </button>
                </div>

                {/* Right: Pricing & Action */}
                <div className="w-full md:w-1/4 p-4 flex flex-col justify-between items-end bg-slate-50/50 dark:bg-white/5 min-w-[200px]">
                    <div className="text-right w-full">
                        <div className="inline-block bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded mb-1">
                            8% OFF
                        </div>
                        <div className="flex items-baseline justify-end gap-1">
                            <span className="text-lg font-bold text-slate-900 dark:text-white">
                                {currencySymbol}{displayPrice.toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-500">/night</span>
                        </div>
                        <div className="text-xs text-slate-400 line-through">
                            {currencySymbol}
                            {(displayPrice * 1.08).toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                            })}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                            (1 night, 1 Room incl. taxes)
                        </div>
                    </div>

                    <button
                        onClick={() => onReserve(displayOfferId)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors mt-4"
                    >
                        Choose room
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RoomCard;
