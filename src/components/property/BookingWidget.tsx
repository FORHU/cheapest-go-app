"use client";

import React from 'react';
import { type Property } from '@/types';
import { MapPin, X, Bed, User, Check } from 'lucide-react';
import { useViewingRoom, useBookingActions } from '@/stores/bookingStore';
import { calculateNights } from '@/lib/utils';

interface BookingWidgetProps {
    property: Property;
    preBookData?: any;
    searchParams?: {
        checkIn?: string;
        checkOut?: string;
        adults?: number;
        children?: number;
    };
}

const BookingWidget: React.FC<BookingWidgetProps> = ({ property, preBookData, searchParams }) => {
    // Use granular selectors (Phase 2)
    const viewingRoom = useViewingRoom();
    const { setViewingRoom } = useBookingActions();

    // Reset viewing room on mount/unmount to ensure clean state
    React.useEffect(() => {
        setViewingRoom(null);
        return () => setViewingRoom(null);
    }, [setViewingRoom]);
    // Format dates if available
    const checkInDate = searchParams?.checkIn ? new Date(searchParams.checkIn) : new Date();
    const checkOutDate = searchParams?.checkOut ? new Date(searchParams.checkOut) : new Date(new Date().setDate(new Date().getDate() + 2));

    const nights = calculateNights(checkInDate, checkOutDate);

    return (
        <>
            {/* Standard Booking Widget */}
            {/* Standard Widget - REMOVED as requested (Hidden by default) */}
            {/* The container with the blue drawing is now gone. */}

            {/* Room Details Panel - Slide-Over Implementation */}
            {viewingRoom && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => setViewingRoom(null)}
                    />

                    {/* Panel */}
                    <div className="relative w-full max-w-[480px] h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200 dark:border-slate-800">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 px-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Room Details</h3>
                            <button
                                onClick={() => setViewingRoom(null)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                            >
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        {/* Image */}
                        <div className="h-64 bg-slate-100 dark:bg-slate-800 relative shrink-0">
                            {viewingRoom.roomPhotos && viewingRoom.roomPhotos.length > 0 ? (
                                <div
                                    className="absolute inset-0 bg-cover bg-center"
                                    style={{ backgroundImage: `url(${viewingRoom.roomPhotos[0]})` }}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-400">
                                    <Bed size={48} />
                                </div>
                            )}
                        </div>

                        {/* Content Scrollable Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                            <h4 className="text-2xl font-display font-bold text-slate-900 dark:text-white mb-2 leading-tight">
                                {viewingRoom.name || viewingRoom.roomName || "Selected Room"}
                            </h4>

                            <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                                {viewingRoom.roomSize && (
                                    <div className="flex items-center gap-1.5">
                                        <MapPin size={16} />
                                        {viewingRoom.roomSize}
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5">
                                    <User size={16} />
                                    {viewingRoom.maxOccupancy || 2} guests
                                </div>
                                {viewingRoom.bedType && (
                                    <div className="flex items-center gap-1.5">
                                        <Bed size={16} />
                                        {viewingRoom.bedType}
                                    </div>
                                )}
                            </div>

                            {viewingRoom.roomDescription && (
                                <div className="mb-8">
                                    <h5 className="text-xs font-bold uppercase text-slate-400 mb-3 tracking-wider">Description</h5>
                                    <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {viewingRoom.roomDescription}
                                    </p>
                                </div>
                            )}

                            <div>
                                <h5 className="text-xs font-bold uppercase text-slate-400 mb-4 tracking-wider">Amenities</h5>
                                <div className="grid grid-cols-2 gap-3">
                                    {(viewingRoom.amenities || ['Air conditioning', 'WiFi', 'Private Bathroom', 'Flat-screen TV', 'Soundproofing']).map((item, i) => (
                                        <div key={i} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                                            <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                                            <span>{typeof item === 'string' ? item : item.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer Action */}
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                            <button
                                onClick={() => {
                                    setViewingRoom(null);
                                    // Scroll to room list logic if needed, or trigger booking
                                    const element = document.getElementById('room-list-section');
                                    if (element) element.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
                            >
                                Book This Room
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </>
    );
};

export default BookingWidget;
