"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { User, Bed, Wifi, Square, X, MapPin, Check } from 'lucide-react';
import { Property } from '@/data/mockProperties';
import { useBookingStore } from '@/stores/bookingStore';
import RoomDetailsView from './RoomDetailsView';

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

const RoomCard = ({
    title,
    price,
    currency = 'PHP',
    maxOccupancy,
    bedType,
    roomSize,
    freeCancellation,
    roomImage,
    description,
    amenities,
    photoCount,
    onReserve,
    onViewDetails
}: {
    title: string;
    price: number;
    currency?: string;
    maxOccupancy?: number;
    bedType?: string;
    roomSize?: string;
    freeCancellation?: boolean;
    roomImage?: string;
    description?: string;
    amenities?: (string | { name: string })[];
    photoCount?: number;
    onReserve: () => void;
    onViewDetails: () => void;
}) => {
    return (
        <div className="border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 overflow-hidden hover:shadow-md transition-shadow">
            {/* Header: Title */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5">
                <h4 className="text-lg font-bold text-slate-900 dark:text-white line-clamp-1">{title}</h4>
            </div>

            <div className="flex flex-col md:flex-row">
                {/* Left: Image */}
                <div className="w-full md:w-1/3 md:max-w-[300px] h-48 md:h-auto relative cursor-pointer group" onClick={onViewDetails}>
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
                    {/* Image Counter Badge (Top Right) */}
                    {photoCount && photoCount > 1 && (
                        <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm">
                            <span>1/{photoCount}</span>
                            <div className="w-2 h-2 bg-white rounded-full ml-1" />
                        </div>
                    )}
                </div>

                {/* Middle: Info & Conditions */}
                <div className="flex-1 p-4 border-r border-slate-100 dark:border-white/5 flex flex-col justify-between">
                    <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white mb-2">Room only</div>
                        <div className="space-y-1">
                            <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                <X size={12} className="text-slate-400" /> No meals included
                            </div>
                            {freeCancellation ? (
                                <div className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                                    <Check size={12} /> Free cancellation
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full border border-slate-300 flex items-center justify-center text-[8px]">i</div>
                                    Non-Refundable
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Room Details (Bottom of Middle Col) */}
                    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-white/5">
                        <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">Room details</div>
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

                        <div className="text-xs font-bold text-slate-900 dark:text-white mt-3 mb-1">Amenities</div>
                        <div className="space-y-1">
                            {(amenities || []).slice(0, 3).map((am, i) => {
                                const name = typeof am === 'string' ? am : am.name;
                                return (
                                    <div key={i} className="text-xs text-slate-500 flex items-center gap-1.5">
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
                                {currency === 'PHP' ? '₱' : currency}{price.toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-500">/night</span>
                        </div>
                        <div className="text-xs text-slate-400 line-through">
                            {currency === 'PHP' ? '₱' : currency}{(price * 1.08).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                            (1 night, 1 Room incl. taxes)
                        </div>
                    </div>

                    <button
                        onClick={onReserve}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors mt-4"
                    >
                        Choose room
                    </button>
                </div>
            </div>
        </div>
    );
};

interface RoomListProps {
    property: Property;
    roomTypes?: RoomType[];
    searchParams?: { checkIn?: string; checkOut?: string; adults?: number; children?: number };
    hotelImages?: string[];  // Hotel images to use as fallbacks for room cards
}

const RoomList: React.FC<RoomListProps> = ({ property, roomTypes, searchParams, hotelImages = [] }) => {
    const router = useRouter();
    const { setBookingDetails, viewingRoom, setViewingRoom } = useBookingStore();

    const handleReserve = (roomTitle: string, price: number) => {
        const checkInDate = searchParams?.checkIn ? new Date(searchParams.checkIn) : new Date(2026, 0, 23);
        const checkOutDate = searchParams?.checkOut ? new Date(searchParams.checkOut) : new Date(2026, 0, 25);

        setBookingDetails({
            property,
            selectedRoom: { id: roomTitle, title: roomTitle, price },
            checkIn: checkInDate,
            checkOut: checkOutDate,
            adults: searchParams?.adults || 2,
            children: searchParams?.children || 0
        });
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
            <div className="fixed inset-0 z-[100] bg-alabaster bg-grid-alabaster bg-[length:40px_40px] overflow-y-auto animate-in fade-in duration-200">
                <RoomDetailsView
                    property={property}
                    room={viewingRoom}
                    onBack={() => setViewingRoom(null)}
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
                                onReserve={() => handleReserve(roomName, priceInfo.amount)}
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
