"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
    const t = useTranslations('property.rooms');
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
                {t('availableRooms', { count: filteredRooms.length })}
            </h3>

            {hasRooms && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {([
                        { key: 'all',  labelKey: 'filterAll',           count: groupedRooms.length },
                        { key: 'rfn',  labelKey: 'filterRefundable',    count: rfnCount },
                        { key: 'nrfn', labelKey: 'filterNonRefundable', count: nrfnCount },
                    ] as { key: RateFilter; labelKey: string; count: number }[]).map(({ key, labelKey, count }) => (
                        <button
                            key={key}
                            onClick={() => handleFilterChange(key)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                rateFilter === key
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                            }`}
                        >
                            {t(labelKey)}
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
                        {t('showingRooms', { start: (currentPage - 1) * ROOMS_PER_PAGE + 1, end: Math.min(currentPage * ROOMS_PER_PAGE, filteredRooms.length), total: filteredRooms.length })}
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
                                galleryImages={hotelImages}
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
                            {rateFilter === 'rfn' ? t('noRefundableRooms') : t('noNonRefundableRooms')}
                        </div>
                    )
                ) : property._tgx?.token ? (
                    // TravelgateX property — show a single booking card using the search token
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-semibold text-slate-900 dark:text-white text-sm">
                                    {property._tgx.boardCode
                                        ? `${property._tgx.boardCode} — ${t('standardRoom')}`
                                        : t('standardRoom')}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {property.refundableTag === 'RFN'
                                        ? t('freeCancellationTick')
                                        : t('nonRefundable')}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-lg font-bold text-slate-900 dark:text-white">
                                    {property.currency || 'USD'} {property.price?.toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-400">{t('total')}</p>
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
                            {t('reserve')}
                        </button>
                    </div>
                ) : (
                    <div className="py-10 text-center flex flex-col items-center gap-3">
                        <div className="text-3xl select-none">🗓️</div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('noRooms')}</p>
                        <button
                            onClick={() => {
                                const picker = document.querySelector<HTMLElement>('[data-date-picker]');
                                if (picker) {
                                    picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    picker.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
                                    setTimeout(() => picker.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2'), 2000);
                                }
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 font-medium underline underline-offset-2 hover:no-underline"
                        >
                            {t('changeDates')}
                        </button>
                    </div>
                )}
            </div>

            {hasRooms && totalPages > 1 && (
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        {t('pageOf', { current: currentPage, total: totalPages })}
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
