"use client";

import React from 'react';
import { Property } from '@/data/mockProperties';
import { ArrowLeft, User, Bed, Wifi, MapPin, Check, Star, Share2, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBookingStore } from '@/stores/bookingStore';

interface RoomDetailsViewProps {
    property: Property;
    room: any; // Using existing loose type for room
    onBack: () => void;
}

const RoomDetailsView: React.FC<RoomDetailsViewProps> = ({ property, room, onBack }) => {
    const [currentPhotoIndex, setCurrentPhotoIndex] = React.useState(0);

    // Scroll to top on mount
    React.useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const amenities = room.amenities || [];

    return (
        <div className="min-h-screen bg-alabaster bg-grid-alabaster bg-[length:40px_40px] pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Sticky Header */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                    >
                        <ArrowLeft size={20} />
                        <span>Back to Property</span>
                    </button>
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px] md:max-w-md hidden sm:block">
                        {room.name || "Room Details"}
                    </div>
                    <div className="flex gap-2">
                        <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                            <Share2 size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-8">
                {/* Header Section */}
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                        {room.name || "Room Details"}
                    </h1>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
                        {room.roomSize && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                                <MapPin size={16} />
                                {room.roomSize}
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                            <User size={16} />
                            {room.maxOccupancy || 2} guests
                        </div>
                        {room.bedType && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                                <Bed size={16} />
                                {room.bedType}
                            </div>
                        )}
                    </div>
                </div>

                {/* Hero Image */}
                <div className="mb-8 rounded-2xl overflow-hidden shadow-lg h-[300px] md:h-[500px] relative bg-slate-200 dark:bg-slate-800 group">
                    {room.roomPhotos && room.roomPhotos.length > 0 ? (
                        <>
                            <img
                                src={room.roomPhotos[currentPhotoIndex]}
                                alt={`${room.name} - Photo ${currentPhotoIndex + 1}`}
                                className="w-full h-full object-cover transition-opacity duration-300"
                            />

                            {/* Navigation Buttons */}
                            {room.roomPhotos.length > 1 && (
                                <>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentPhotoIndex((prev) => (prev === 0 ? room.roomPhotos.length - 1 : prev - 1));
                                        }}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70 text-slate-800 dark:text-white transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <ChevronLeft size={24} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentPhotoIndex((prev) => (prev === room.roomPhotos.length - 1 ? 0 : prev + 1));
                                        }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70 text-slate-800 dark:text-white transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <ChevronRight size={24} />
                                    </button>

                                    {/* Counter Badge */}
                                    <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm font-medium">
                                        {currentPhotoIndex + 1} / {room.roomPhotos.length}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Bed size={64} />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    {/* Left Column: Description & Amenities */}
                    <div className="lg:col-span-2 space-y-10">

                        {/* Description */}
                        <section>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Room Description</h3>
                            <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed text-lg">
                                {room.roomDescription || "No description available for this room."}
                            </div>
                        </section>

                        <hr className="border-slate-200 dark:border-white/10" />

                        {/* Amenities */}
                        <section>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Room Amenities</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {amenities.map((item: string | { name: string }, i: number) => {
                                    const name = typeof item === 'string' ? item : item.name;
                                    return (
                                        <div key={i} className="flex items-center gap-3 text-slate-700 dark:text-slate-300 p-3 rounded-lg border border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                                                <Check size={16} />
                                            </div>
                                            <span className="font-medium">{name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                    </div>

                    {/* Right Column: Booking Card (Sticky) */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
                            <div className="mb-6">
                                <span className="text-3xl font-bold text-slate-900 dark:text-white">Price Varies</span>
                                <span className="text-sm text-slate-500 block">Check dates for specific rates</span>
                            </div>

                            <button
                                onClick={onBack}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 mb-4"
                            >
                                Select this Room
                            </button>

                            <p className="text-xs text-center text-slate-500">
                                Return to list to choose specific rate options
                            </p>

                            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <Check size={16} className="text-emerald-500" />
                                    <span>Instant Confirmation</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <Check size={16} className="text-emerald-500" />
                                    <span>Best Price Guarantee</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoomDetailsView;
