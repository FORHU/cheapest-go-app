"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Property } from '@/data/mockProperties';
import { useViewingRoom, useBookingActions } from '@/stores/bookingStore';
import RoomDetailsView from './RoomDetailsView';
import { RoomCard } from './RoomCard';

interface RoomType {
    offerId?: string;
    name?: string;
    roomName?: string;  // LiteAPI may use this field
    maxOccupancy?: number;
    bedType?: string;
    roomSize?: string;
    roomPhotos?: string[];  // From roomMapping
    roomDescription?: string;  // From roomMapping
    rates?: Array<{
        rateId?: string;
        name?: string;
        boardType?: string;
        boardName?: string;
        maxOccupancy?: number;
        retailRate?: {
            total?: Array<{ amount: number; currency: string }> | { amount: number };
        };
        cancellationPolicy?: { cancelPolicyInfos?: Array<{ cancelDeadline?: string }> };
    }>;
    amenities?: (string | { name: string })[]; // From roomMapping (Can be string[] or object[])
}

interface RoomListProps {
    property: Property;
    roomTypes?: RoomType[];
    searchParams?: { checkIn?: string; checkOut?: string; adults?: number; children?: number };
    hotelImages?: string[];  // Hotel images to use as fallbacks for room cards
}

const RoomList: React.FC<RoomListProps> = ({ property, roomTypes, searchParams, hotelImages = [] }) => {
    const router = useRouter();
    // Use granular selectors (Phase 2)
    const viewingRoom = useViewingRoom();
    const {
        setProperty,
        setSelectedRoom,
        setDates,
        setGuests,
        setViewingRoom,
    } = useBookingActions();

    const handleReserve = (roomTitle: string, price: number, offerId?: string) => {
        const checkInDate = searchParams?.checkIn ? new Date(searchParams.checkIn) : new Date(2026, 0, 23);
        const checkOutDate = searchParams?.checkOut ? new Date(searchParams.checkOut) : new Date(2026, 0, 25);

        // Use specific actions (Phase 2)
        setProperty(property);
        setSelectedRoom({ id: roomTitle, offerId, title: roomTitle, price });
        setDates(checkInDate, checkOutDate);
        setGuests(searchParams?.adults || 2, searchParams?.children || 0);

        router.push('/checkout');
    };

    // Extract price from API rate structure
    const extractPrice = (rates?: RoomType['rates']): { amount: number; currency: string } => {
        if (!rates || rates.length === 0) return { amount: 0, currency: 'PHP' };
        const total = rates[0]?.retailRate?.total;
        if (Array.isArray(total) && total.length > 0) {
            return { amount: total[0].amount || 0, currency: total[0].currency || 'PHP' };
        }
        if (typeof total === 'object' && total !== null && 'amount' in total) {
            return { amount: (total as { amount: number }).amount || 0, currency: 'PHP' };
        }
        return { amount: 0, currency: 'PHP' };
    };

    // Check if free cancellation
    const hasFreeCancellation = (rates?: RoomType['rates']): boolean => {
        if (!rates || rates.length === 0) return true;
        const policy = rates[0]?.cancellationPolicy;
        return !!policy?.cancelPolicyInfos?.length;
    };

    // Use API room types if available, otherwise fall back to mock data
    const displayRooms = roomTypes && roomTypes.length > 0 ? roomTypes : null;

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
        <div id="room-list-section" className="mt-8 scroll-mt-24">
            <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-6">
                Available Rooms {displayRooms && `(${displayRooms.length})`}
            </h3>

            {/* Vertical Stack Layout for Wide Cards */}
            <div className="flex flex-col gap-4">
                {displayRooms ? (
                    displayRooms.map((room, index) => {
                        const priceInfo = extractPrice(room.rates);
                        const roomName = room.name || room.rates?.[0]?.name || `Room ${index + 1}`;
                        const roomImage = room.roomPhotos?.[0] || hotelImages[index % hotelImages.length];

                        return (
                            <RoomCard
                                key={room.offerId || index}
                                title={roomName}
                                price={priceInfo.amount}
                                currency={priceInfo.currency}
                                maxOccupancy={room.maxOccupancy}
                                bedType={room.bedType}
                                roomSize={room.roomSize}
                                freeCancellation={hasFreeCancellation(room.rates)}
                                roomImage={roomImage}
                                description={room.roomDescription}
                                amenities={room.amenities}
                                photoCount={room.roomPhotos?.length}
                                onReserve={() => handleReserve(roomName, priceInfo.amount, room.offerId)}
                                onViewDetails={() => {
                                    setViewingRoom(room);
                                    window.scrollTo(0, 0);
                                }}
                            />
                        );
                    })
                ) : (
                    /* Mock Fallback */
                    <>
                        <RoomCard title="Deluxe King Room" price={5200} onReserve={() => handleReserve("Deluxe King Room", 5200)} onViewDetails={() => setViewingRoom({ name: "Deluxe King Room" })} />
                        <RoomCard title="Executive Suite" price={8500} onReserve={() => handleReserve("Executive Suite", 8500)} onViewDetails={() => setViewingRoom({ name: "Executive Suite" })} />
                    </>
                )}
            </div>
        </div>
    );
};

export default RoomList;
