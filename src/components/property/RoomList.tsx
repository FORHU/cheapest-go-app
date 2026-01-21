"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { User, Bed, Wifi, Square } from 'lucide-react';
import { Property } from '@/data/mockProperties';
import { useBookingStore } from '@/stores/bookingStore';

const RoomCard = ({ title, price, onReserve }: { title: string, price: number, onReserve: () => void }) => (
    <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col md:flex-row">
        <div className="w-full md:w-64 h-48 bg-slate-100 dark:bg-slate-800 flex-shrink-0">
            {/* Room Image Placeholder */}
            <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: 'url(https://via.placeholder.com/400x300)' }} />
        </div>
        <div className="flex-1 p-6 flex flex-col justify-between">
            <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h4>
                <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300 mb-4">
                    <span className="flex items-center gap-1"><Square size={14} /> 25 m²</span>
                    <span className="flex items-center gap-1"><User size={14} /> Sleeps 2</span>
                    <span className="flex items-center gap-1"><Bed size={14} /> 1 Queen Bed</span>
                    <span className="flex items-center gap-1"><Wifi size={14} /> Free WiFi</span>
                </div>
            </div>
            <div className="flex justify-between items-end border-t border-slate-100 dark:border-white/5 pt-4">
                <div className="flex items-center text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                    Free Cancellation
                </div>
                <div className="text-right">
                    <div className="text-xl font-bold text-slate-900 dark:text-white">₱{price.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">includes taxes & fees</div>
                </div>
                <button
                    onClick={onReserve}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg text-sm"
                >
                    Reserve
                </button>
            </div>
        </div>
    </div>
);

interface RoomListProps {
    property: Property;
}

const RoomList: React.FC<RoomListProps> = ({ property }) => {
    const router = useRouter();
    const { setBookingDetails } = useBookingStore();
    // Default dates/travelers if none selected (simulate from search store if we wanted, but let's just use defaults for now or existing store if any)

    const handleReserve = (roomTitle: string, price: number) => {
        setBookingDetails({
            property,
            selectedRoom: { id: roomTitle, title: roomTitle, price },
            checkIn: new Date(2026, 0, 23), // Mock dates Jan 23
            checkOut: new Date(2026, 0, 25), // Mock dates Jan 25
            adults: 2,
            children: 0
        });
        router.push('/checkout');
    };

    return (
        <div id="room-list-section" className="space-y-6 mt-8 scroll-mt-24">
            <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white">Available Rooms</h3>
            <RoomCard
                title="Deluxe King Room"
                price={5200}
                onReserve={() => handleReserve("Deluxe King Room", 5200)}
            />
            <RoomCard
                title="Executive Suite with Balcony"
                price={8500}
                onReserve={() => handleReserve("Executive Suite with Balcony", 8500)}
            />
            <RoomCard
                title="Family Room (2 Queen Beds)"
                price={7800}
                onReserve={() => handleReserve("Family Room (2 Queen Beds)", 7800)}
            />
        </div>
    );
};

export default RoomList;
