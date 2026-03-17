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
            <div className="fixed inset-0 z-[100] bg-alabaster dark:bg-slate-950 bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px] overflow-y-auto animate-in fade-in duration-200">
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
                ) : (
                    <>
                        <RoomCard
                            title="Deluxe King Room"
                            price={5200}
                            onReserve={() => handleReserve("Deluxe King Room", 5200)}
                            onViewDetails={() => setViewingRoom({ name: "Deluxe King Room" })}
                        />
                        <RoomCard
                            title="Executive Suite"
                            price={8500}
                            onReserve={() => handleReserve("Executive Suite", 8500)}
                            onViewDetails={() => setViewingRoom({ name: "Executive Suite" })}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default RoomList;
