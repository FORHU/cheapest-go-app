"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { type Property } from '@/types';
import { ArrowLeft, User, Bed, MapPin, Check, Share2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useBookingActions } from '@/stores/bookingStore';

// Strip HTML tags from text
const stripHtml = (html: string): string => {
    if (!html) return '';
    let text = html.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
};

interface RoomDetailsViewProps {
    property: Property;
    room: any; // Using existing loose type for room
    onBack: () => void;
    searchParams?: { checkIn?: string; checkOut?: string; adults?: number; children?: number };
}

const RoomDetailsView: React.FC<RoomDetailsViewProps> = ({ property, room, onBack, searchParams }) => {
    const router = useRouter();
    const { setProperty, setSelectedRoom, setDates, setGuests } = useBookingActions();
    const [currentPhotoIndex, setCurrentPhotoIndex] = React.useState(0);
    const [lightboxOpen, setLightboxOpen] = React.useState(false);

    // Scroll to top on mount
    React.useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const amenities = room.amenities || [];
    const photos: string[] = room.roomPhotos || [];

    // Extract price from room rates
    const extractPrice = (rates?: any[]): number => {
        if (!rates || rates.length === 0) return 0;
        const total = rates[0]?.retailRate?.total;
        if (Array.isArray(total) && total.length > 0) {
            return total[0].amount || 0;
        }
        if (typeof total === 'object' && total !== null && 'amount' in total) {
            return (total as { amount: number }).amount || 0;
        }
        return 0;
    };

    const handleSelectRoom = () => {
        const checkInDate = searchParams?.checkIn ? new Date(searchParams.checkIn) : new Date(2026, 0, 23);
        const checkOutDate = searchParams?.checkOut ? new Date(searchParams.checkOut) : new Date(2026, 0, 25);
        const roomName = room.name || room.rates?.[0]?.name || "Selected Room";
        const roomPrice = extractPrice(room.rates);

        setProperty(property);
        setSelectedRoom({
            id: roomName,
            offerId: room.offerId,
            title: roomName,
            price: roomPrice
        });
        setDates(checkInDate, checkOutDate);
        setGuests(searchParams?.adults || 2, searchParams?.children || 0);

        router.push('/checkout');
    };

    const goToPrev = () => setCurrentPhotoIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
    const goToNext = () => setCurrentPhotoIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));

    return (
        <div className="min-h-screen bg-transparent pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Sticky Header */}
            <div className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-white/10">
                <div className="max-w-5xl mx-auto px-3 md:px-4 h-14 md:h-16 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                    >
                        <ArrowLeft size={20} />
                        <span className="hidden sm:inline">Back to Property</span>
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

            <div className="max-w-5xl mx-auto px-3 md:px-4 py-4 md:py-8">
                {/* Header Section */}
                <div className="mb-4 md:mb-8">
                    <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3 md:mb-4">
                        {room.name || "Room Details"}
                    </h1>
                    <div className="flex flex-wrap gap-2 md:gap-4 text-sm text-slate-500 dark:text-slate-400">
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

                {/* Hero Image — clickable to open lightbox */}
                <div
                    className="mb-4 md:mb-8 rounded-2xl overflow-hidden shadow-lg h-[220px] sm:h-[300px] md:h-[500px] relative bg-slate-200 dark:bg-slate-800 group cursor-pointer"
                    onClick={() => photos.length > 0 && setLightboxOpen(true)}
                >
                    {photos.length > 0 ? (
                        <>
                            <img
                                src={photos[currentPhotoIndex]}
                                alt={`${room.name} - Photo ${currentPhotoIndex + 1}`}
                                className="w-full h-full object-cover transition-opacity duration-300"
                            />

                            {/* Navigation Buttons */}
                            {photos.length > 1 && (
                                <>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); goToPrev(); }}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70 text-slate-800 dark:text-white transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <ChevronLeft size={24} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); goToNext(); }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70 text-slate-800 dark:text-white transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <ChevronRight size={24} />
                                    </button>

                                    {/* Counter Badge */}
                                    <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm font-medium">
                                        {currentPhotoIndex + 1} / {photos.length}
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-12">
                    {/* Left Column: Description & Amenities */}
                    <div className="lg:col-span-2 space-y-10">

                        {/* Description */}
                        <section className="relative">
                            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-blue-400 to-transparent rounded-full hidden lg:block" />
                            <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900/50 rounded-2xl p-6 border border-slate-100 dark:border-white/10 shadow-sm">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                        <Bed size={20} className="text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Room Description</h3>
                                </div>
                                <div className="text-slate-600 dark:text-slate-300 leading-relaxed space-y-3">
                                    {stripHtml(room.roomDescription)?.split('\n').filter(Boolean).map((paragraph: string, idx: number) => (
                                        <p key={idx} className="text-[15px]">{paragraph}</p>
                                    )) || <p className="text-slate-400 italic">No description available for this room.</p>}
                                </div>
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
                                            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
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
                        <div className="lg:sticky lg:top-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-lg p-4 md:p-6">
                            <div className="mb-6">
                                <span className="text-3xl font-bold text-slate-900 dark:text-white">Price Varies</span>
                                <span className="text-sm text-slate-500 block">Check dates for specific rates</span>
                            </div>

                            <button
                                onClick={handleSelectRoom}
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

            {/* Image Lightbox Dialog */}
            {lightboxOpen && photos.length > 0 && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setLightboxOpen(false)}
                >
                    {/* Close button */}
                    <button
                        onClick={() => setLightboxOpen(false)}
                        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
                    >
                        <X size={24} />
                    </button>

                    {/* Counter */}
                    <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium z-10">
                        {currentPhotoIndex + 1} / {photos.length}
                    </div>

                    {/* Image */}
                    <img
                        src={photos[currentPhotoIndex]}
                        alt={`${room.name} - Photo ${currentPhotoIndex + 1}`}
                        className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl select-none"
                        onClick={(e) => e.stopPropagation()}
                    />

                    {/* Nav buttons */}
                    {photos.length > 1 && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); goToPrev(); }}
                                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
                            >
                                <ChevronLeft size={28} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); goToNext(); }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
                            >
                                <ChevronRight size={28} />
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default RoomDetailsView;
