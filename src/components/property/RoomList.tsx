"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type Property } from '@/types';
import { useBookingActions } from '@/stores/bookingStore';
import { useRoomGrouping } from '@/hooks';
import { RoomType } from '@/lib/room';
import { RoomCard } from './RoomCard';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency } from '@/lib/currency';

const ROOMS_PER_PAGE = 5;

type RateFilter = 'all' | 'rfn' | 'nrfn';

interface RoomListProps {
    property: Property;
    roomTypes?: RoomType[];
    searchParams?: { checkIn?: string; checkOut?: string; adults?: number; children?: number; rooms?: number; currency?: string };
    hotelImages?: string[];
}

const RoomList: React.FC<RoomListProps> = ({ property, roomTypes, searchParams, hotelImages = [] }) => {
    const router = useRouter();
    const {
        setProperty,
        setSelectedRoom,
        setDates,
        setGuests,
    } = useBookingActions();

    // Use the room grouping hook for data transformation
    const { groupedRooms, hasRooms, getImage, findRate } = useRoomGrouping({
        roomTypes,
        hotelImages,
    });

    const [rateFilter, setRateFilter] = useState<RateFilter>('all');
    const [currentPage, setCurrentPage] = useState(1);

    const filteredRooms = rateFilter === 'all'
        ? groupedRooms
        : groupedRooms.filter(g =>
            rateFilter === 'rfn'
                ? g.rateOptions.some(r => r.refundable === true)
                : g.rateOptions.some(r => r.refundable === false)
        );

    const rfnCount  = groupedRooms.filter(g => g.rateOptions.some(r => r.refundable === true)).length;
    const nrfnCount = groupedRooms.filter(g => g.rateOptions.some(r => r.refundable === false)).length;

    const totalPages = Math.ceil(filteredRooms.length / ROOMS_PER_PAGE);
    const paginatedRooms = filteredRooms.slice((currentPage - 1) * ROOMS_PER_PAGE, currentPage * ROOMS_PER_PAGE);

    const handleFilterChange = (key: RateFilter) => {
        setRateFilter(key);
        setCurrentPage(1);
    };

    const targetCurrency = useUserCurrency();

    const handleReserve = (roomTitle: string, price: number, roomCurrency?: string, offerId?: string) => {
        const checkInDate = searchParams?.checkIn ? new Date(searchParams.checkIn) : new Date(2026, 0, 23);
        const checkOutDate = searchParams?.checkOut ? new Date(searchParams.checkOut) : new Date(2026, 0, 25);

        const sourceCurrency = roomCurrency || searchParams?.currency || 'PHP';
        
        // Convert to current user currency for the store
        const convertedPrice = convertCurrency(price, sourceCurrency, targetCurrency);

        setProperty(property);
        setSelectedRoom({ 
            id: roomTitle, 
            offerId, 
            title: roomTitle, 
            price: convertedPrice,
            currency: targetCurrency 
        });
        setDates(checkInDate, checkOutDate);
        setGuests(searchParams?.adults || 2, searchParams?.children || 0);

        const params = new URLSearchParams();
        params.set('currency', targetCurrency);
        router.push(`/checkout?${params.toString()}`);
    };

    return (
        <div id="room-list-section" className="mt-6 lg:mt-8 scroll-mt-24">
            <h3 className="text-[14px] lg:text-xl font-display font-bold text-slate-900 dark:text-white mb-3 lg:mb-4">
                Available Rooms {hasRooms && `(${filteredRooms.length})`}
            </h3>

            {hasRooms && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {([
                        { key: 'all',  label: 'All',             count: groupedRooms.length },
                        { key: 'rfn',  label: 'Refundable',      count: rfnCount },
                        { key: 'nrfn', label: 'Non-refundable',  count: nrfnCount },
                    ] as { key: RateFilter; label: string; count: number }[]).map(({ key, label, count }) => (
                        <button
                            key={key}
                            onClick={() => handleFilterChange(key)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                rateFilter === key
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                            }`}
                        >
                            {label}
                            <span className={`text-[10px] px-1 rounded-full ${rateFilter === key ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                {count}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className="flex flex-col gap-4">
                {hasRooms && filteredRooms.length > 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        Showing {(currentPage - 1) * ROOMS_PER_PAGE + 1}–{Math.min(currentPage * ROOMS_PER_PAGE, filteredRooms.length)} of {filteredRooms.length} rooms
                    </p>
                )}
                {hasRooms ? (
                    filteredRooms.length > 0 ? paginatedRooms.map((groupedRoom, index) => {
                        const roomImage = getImage(groupedRoom, index);
                        const hasMultipleRates = groupedRoom.rateOptions.length > 1;
                        const lowestRate = groupedRoom.rateOptions[0];


                        return (
                            <RoomCard
                                key={groupedRoom.roomName + index}
                                title={groupedRoom.roomName}
                                price={groupedRoom.lowestPrice}
                                currency={groupedRoom.currency}
                                maxOccupancy={groupedRoom.maxOccupancy}
                                bedType={groupedRoom.bedType}
                                roomSize={groupedRoom.roomSize}
                                freeCancellation={lowestRate?.refundable}
                                roomImage={roomImage}
                                roomImages={groupedRoom.roomPhotos}
                                amenities={groupedRoom.amenities}
                                photoCount={groupedRoom.roomPhotos?.length}
                                rateOptions={hasMultipleRates ? groupedRoom.rateOptions : undefined}
                                onReserve={(offerId) => {
                                    const selectedRate = findRate(groupedRoom, offerId);
                                    handleReserve(
                                        groupedRoom.roomName,
                                        selectedRate?.price || groupedRoom.lowestPrice,
                                        selectedRate?.currency || groupedRoom.currency,
                                        offerId || lowestRate?.offerId
                                    );
                                }}
                            />
                        );
                    }) : (
                        <div className="py-6 text-center text-slate-400 text-sm">
                            No {rateFilter === 'rfn' ? 'refundable' : 'non-refundable'} rooms available.
                        </div>
                    )
                ) : property._tgx?.token ? (
                    // TravelgateX property — show a single booking card using the search token
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-semibold text-slate-900 dark:text-white text-sm">
                                    {property._tgx.boardCode
                                        ? `${property._tgx.boardCode} — Standard Room`
                                        : 'Standard Room'}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {property.refundableTag === 'RFN'
                                        ? '✓ Free cancellation'
                                        : 'Non-refundable'}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-lg font-bold text-slate-900 dark:text-white">
                                    {property.currency || 'USD'} {property.price?.toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-400">total</p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleReserve(
                                property._tgx?.boardCode ? `${property._tgx.boardCode} Standard Room` : 'Standard Room',
                                property.price,
                                property.currency,
                                `TGX:${property._tgx?.token}`
                            )}
                            className="w-full bg-primary text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            Reserve
                        </button>
                    </div>
                ) : (
                    <div className="py-8 text-center text-slate-400 text-sm">
                        No rooms available for the selected dates.
                    </div>
                )}
            </div>

            {hasRooms && totalPages > 1 && (
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium border transition-colors ${
                                    page === currentPage
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                            >
                                {page}
                            </button>
                        ))}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoomList;
