"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { User, Bed, Wifi, Square } from 'lucide-react';
import { Property } from '@/data/mockProperties';
import { useBookingStore } from '@/stores/bookingStore';

interface RoomType {
    offerId?: string;
    name?: string;
    maxOccupancy?: number;
    bedType?: string;
    roomSize?: string;
    rates?: Array<{
        name?: string;
        retailRate?: {
            total?: Array<{ amount: number; currency: string }> | { amount: number };
        };
        cancellationPolicy?: { cancelPolicyInfos?: Array<{ cancelDeadline?: string }> };
    }>;
}

const RoomCard = ({
    title,
    price,
    currency = 'PHP',
    maxOccupancy,
    bedType,
    roomSize,
    freeCancellation,
    onReserve
}: {
    title: string;
    price: number;
    currency?: string;
    maxOccupancy?: number;
    bedType?: string;
    roomSize?: string;
    freeCancellation?: boolean;
    onReserve: () => void;
}) => (
    <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-slate-900/50 hover:shadow-lg transition-shadow">
        {/* Compact Room Image */}
        <div className="w-full h-32 bg-slate-100 dark:bg-slate-800">
            <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: 'url(https://via.placeholder.com/400x200)' }} />
        </div>

        {/* Room Info */}
        <div className="p-4">
            <h4 className="text-base font-bold text-slate-900 dark:text-white mb-2 line-clamp-1">{title}</h4>

            {/* Room Details - Compact */}
            <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                <span className="flex items-center gap-1">
                    <User size={12} /> {maxOccupancy || 2} guests
                </span>
                {bedType && (
                    <span className="flex items-center gap-1">
                        <Bed size={12} /> {bedType}
                    </span>
                )}
                <span className="flex items-center gap-1">
                    <Wifi size={12} /> WiFi
                </span>
            </div>

            {/* Free Cancellation Badge */}
            {freeCancellation && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-3">
                    ✓ Free Cancellation
                </div>
            )}

            {/* Price and Reserve Button */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/5">
                <div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                        {currency === 'PHP' ? '₱' : currency}{price.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">per night</div>
                </div>
                <button
                    onClick={onReserve}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm"
                >
                    Reserve
                </button>
            </div>
        </div>
    </div>
);

interface RoomListProps {
    property: Property;
    roomTypes?: RoomType[];
    searchParams?: { checkIn?: string; checkOut?: string; adults?: number; children?: number };
}

const RoomList: React.FC<RoomListProps> = ({ property, roomTypes, searchParams }) => {
    const router = useRouter();
    const { setBookingDetails } = useBookingStore();

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

    return (
        <div id="room-list-section" className="mt-8 scroll-mt-24">
            <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-6">
                Available Rooms {displayRooms && `(${displayRooms.length})`}
            </h3>

            {/* 2-Column Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayRooms ? (
                    displayRooms.map((room, index) => {
                        const priceInfo = extractPrice(room.rates);
                        return (
                            <RoomCard
                                key={room.offerId || index}
                                title={room.name || `Room ${index + 1}`}
                                price={priceInfo.amount}
                                currency={priceInfo.currency}
                                maxOccupancy={room.maxOccupancy}
                                bedType={room.bedType}
                                roomSize={room.roomSize}
                                freeCancellation={hasFreeCancellation(room.rates)}
                                onReserve={() => handleReserve(room.name || `Room ${index + 1}`, priceInfo.amount)}
                            />
                        );
                    })
                ) : (
                    // Fallback mock rooms
                    <>
                        <RoomCard title="Deluxe King Room" price={5200} onReserve={() => handleReserve("Deluxe King Room", 5200)} />
                        <RoomCard title="Executive Suite with Balcony" price={8500} onReserve={() => handleReserve("Executive Suite with Balcony", 8500)} />
                        <RoomCard title="Family Room (2 Queen Beds)" price={7800} onReserve={() => handleReserve("Family Room (2 Queen Beds)", 7800)} />
                    </>
                )}
            </div>
        </div>
    );
};

export default RoomList;

