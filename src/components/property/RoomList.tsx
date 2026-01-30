"use client";

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Property } from '@/data/mockProperties';
import { useViewingRoom, useBookingActions } from '@/stores/bookingStore';
import RoomDetailsView from './RoomDetailsView';
import { RoomCard, RateOption } from './RoomCard';

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
        refundableTag?: string;
    }>;
    amenities?: (string | { name: string })[]; // From roomMapping (Can be string[] or object[])
}

/** Grouped room with multiple rate options */
interface GroupedRoom {
    roomName: string;
    roomTypes: RoomType[];
    rateOptions: RateOption[];
    lowestPrice: number;
    currency: string;
    maxOccupancy?: number;
    bedType?: string;
    roomSize?: string;
    roomPhotos?: string[];
    roomDescription?: string;
    amenities?: (string | { name: string })[];
}

interface RoomListProps {
    property: Property;
    roomTypes?: RoomType[];
    searchParams?: { checkIn?: string; checkOut?: string; adults?: number; children?: number; rooms?: number };
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

    // Check if free cancellation based on refundableTag or cancellation policy
    const hasFreeCancellation = (rates?: RoomType['rates']): boolean => {
        if (!rates || rates.length === 0) return false;
        // Check refundableTag first (LiteAPI standard)
        if (rates[0]?.refundableTag === 'RFN') return true;
        if (rates[0]?.refundableTag === 'NRFN') return false;
        // Fallback to checking cancellation policy
        const policy = rates[0]?.cancellationPolicy;
        return !!policy?.cancelPolicyInfos?.length;
    };

    // Group roomTypes by their physical room name (rates are different pricing options)
    const groupedRooms = useMemo((): GroupedRoom[] => {
        if (!roomTypes || roomTypes.length === 0) return [];

        const groups = new Map<string, GroupedRoom>();

        roomTypes.forEach((roomType) => {
            // Get room name - LiteAPI stores it in rates[0].name
            const roomName = roomType.rates?.[0]?.name || roomType.name || roomType.roomName || 'Standard Room';
            // Normalize room name (remove rate-specific suffixes like "- Non Refundable")
            const normalizedName = roomName
                .replace(/\s*-\s*(non[- ]?refundable|refundable|room only|breakfast included).*$/i, '')
                .trim();

            const priceInfo = extractPrice(roomType.rates);
            const refundable = hasFreeCancellation(roomType.rates);

            const rateOption: RateOption = {
                offerId: roomType.offerId || '',
                price: priceInfo.amount,
                currency: priceInfo.currency,
                boardType: roomType.rates?.[0]?.boardType,
                boardName: roomType.rates?.[0]?.boardName || 'Room only',
                refundable,
                cancellationDeadline: roomType.rates?.[0]?.cancellationPolicy?.cancelPolicyInfos?.[0]?.cancelDeadline
            };

            if (groups.has(normalizedName)) {
                const existing = groups.get(normalizedName)!;
                existing.rateOptions.push(rateOption);
                existing.roomTypes.push(roomType);
                // Update lowest price
                if (priceInfo.amount < existing.lowestPrice) {
                    existing.lowestPrice = priceInfo.amount;
                }
                // Merge photos if new ones found
                if (roomType.roomPhotos && roomType.roomPhotos.length > 0 && (!existing.roomPhotos || existing.roomPhotos.length === 0)) {
                    existing.roomPhotos = roomType.roomPhotos;
                }
            } else {
                groups.set(normalizedName, {
                    roomName: normalizedName,
                    roomTypes: [roomType],
                    rateOptions: [rateOption],
                    lowestPrice: priceInfo.amount,
                    currency: priceInfo.currency,
                    maxOccupancy: roomType.maxOccupancy || roomType.rates?.[0]?.maxOccupancy,
                    bedType: roomType.bedType,
                    roomSize: roomType.roomSize,
                    roomPhotos: roomType.roomPhotos,
                    roomDescription: roomType.roomDescription,
                    amenities: roomType.amenities
                });
            }
        });

        // Sort rate options by price within each group
        groups.forEach((group) => {
            group.rateOptions.sort((a, b) => a.price - b.price);
        });

        return Array.from(groups.values());
    }, [roomTypes]);

    // Use grouped rooms if available
    const displayRooms = groupedRooms.length > 0 ? groupedRooms : null;

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
                    displayRooms.map((groupedRoom, index) => {
                        const roomImage = groupedRoom.roomPhotos?.[0] || hotelImages[index % hotelImages.length];
                        const hasMultipleRates = groupedRoom.rateOptions.length > 1;
                        const lowestRate = groupedRoom.rateOptions[0]; // Already sorted by price

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
                                    const selectedRate = offerId
                                        ? groupedRoom.rateOptions.find(r => r.offerId === offerId)
                                        : lowestRate;
                                    handleReserve(
                                        groupedRoom.roomName,
                                        selectedRate?.price || groupedRoom.lowestPrice,
                                        offerId || lowestRate?.offerId
                                    );
                                }}
                                onViewDetails={() => {
                                    // Pass the first roomType for details view
                                    setViewingRoom(groupedRoom.roomTypes[0]);
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
