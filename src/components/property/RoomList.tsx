"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { type Property } from '@/types';
import { useViewingRoom, useBookingActions } from '@/stores/bookingStore';
import { useRoomGrouping } from '@/hooks';
import { RoomType } from '@/lib/room';
import RoomDetailsView from './RoomDetailsView';
import { RoomCard } from './RoomCard';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency } from '@/lib/currency';

interface RoomListProps {
    property: Property;
    roomTypes?: RoomType[];
    searchParams?: { checkIn?: string; checkOut?: string; adults?: number; children?: number; rooms?: number; currency?: string };
    hotelImages?: string[];
}

const RoomList: React.FC<RoomListProps> = ({ property, roomTypes, searchParams, hotelImages = [] }) => {
    const router = useRouter();
    const viewingRoom = useViewingRoom();
    const {
        setProperty,
        setSelectedRoom,
        setDates,
        setGuests,
        setViewingRoom,
    } = useBookingActions();

    // Use the room grouping hook for data transformation
    const { groupedRooms, hasRooms, getImage, findRate } = useRoomGrouping({
        roomTypes,
        hotelImages,
    });

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

    // Full Page Room Details Overlay
    if (viewingRoom) {
        return (
            <div className="fixed inset-0 z-100 bg-alabaster dark:bg-slate-950 bg-grid-alabaster dark:bg-grid-obsidian bg-size:40px_40px overflow-y-auto animate-in fade-in duration-200">
                <RoomDetailsView
                    property={property}
                    room={viewingRoom}
                    onBack={() => setViewingRoom(null)}
                    searchParams={searchParams}
                />
            </div>
        );
    }

    return (
        <div id="room-list-section" className="mt-6 lg:mt-8 scroll-mt-24">
            <h3 className="text-[14px] lg:text-xl font-display font-bold text-slate-900 dark:text-white mb-4 lg:mb-6">
                Available Rooms {hasRooms && `(${groupedRooms.length})`}
            </h3>

            <div className="flex flex-col gap-4">
                {hasRooms ? (
                    groupedRooms.map((groupedRoom, index) => {
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
                                onViewDetails={() => {
                                    setViewingRoom(groupedRoom.roomTypes[0]);
                                    window.scrollTo(0, 0);
                                }}
                            />
                        );
                    })
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
        </div>
    );
};

export default RoomList;
