"use client";

import React, { useState, useCallback, useRef } from 'react';
import { Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PropertyGalleryProps {
    images: string[];
}

import Image from 'next/image';

const PropertyGallery: React.FC<PropertyGalleryProps> = ({ images }) => {
    const displayImages = images.filter(img => img && img.length > 0);
    const hasImages = displayImages.length > 0;
    const mainImage = displayImages[0] || '';
    const subImages = displayImages.slice(1, 5);

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const thumbnailContainerRef = useRef<HTMLDivElement>(null);

    const gallerySubImages = subImages;

    const handleOpen = useCallback((index: number) => {
        setSelectedIndex(index);
    }, []);

    const handleClose = useCallback(() => setSelectedIndex(null), []);

    const handlePrev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedIndex(prev => {
            if (prev === null) return null;
            return prev === 0 ? displayImages.length - 1 : prev - 1;
        });
    }, [displayImages.length]);

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedIndex(prev => {
            if (prev === null) return null;
            return prev === displayImages.length - 1 ? 0 : prev + 1;
        });
    }, [displayImages.length]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') handleClose();
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'ArrowRight') handleNext();
    }, [handleClose, handlePrev, handleNext]);

    const scrollToThumbnail = useCallback((index: number) => {
        if (thumbnailContainerRef.current) {
            const thumbnail = thumbnailContainerRef.current.querySelector(`[data-index="${index}"]`) as HTMLElement;
            thumbnail?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, []);

    const handleThumbnailClick = useCallback((index: number) => {
        setSelectedIndex(index);
        scrollToThumbnail(index);
    }, [scrollToThumbnail]);

    return (
        <>
            {/* Gallery */}
            {!hasImages ? (
                <div className="h-[200px] md:h-[400px] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <div className="text-center text-slate-400">
                        <ImageIcon size={48} className="mx-auto mb-2 opacity-50" />
                        <p>No images available</p>
                    </div>
                </div>
            ) : displayImages.length === 1 ? (
                <div
                    className="h-[200px] md:h-[400px] rounded-xl overflow-hidden relative cursor-pointer group"
                    onClick={() => handleOpen(0)}
                >
                    <Image
                        src={mainImage}
                        alt="Property view"
                        fill
                        fetchPriority="high"
                        className="object-cover hover:scale-105 transition-transform duration-500"
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); handleOpen(0); }}
                        className="absolute bottom-3 right-3 md:bottom-4 md:right-4 bg-white/90 backdrop-blur text-slate-900 border border-slate-200 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-sm hover:scale-105 transition-transform z-10"
                    >
                        <ImageIcon size={14} />
                        View photo
                    </button>
                </div>
            ) : (
                <>
                    {/* Mobile: Horizontal swipe carousel */}
                    <div className="md:hidden relative h-[200px] rounded-xl overflow-hidden">
                        <div className="flex overflow-x-auto snap-x snap-mandatory h-full no-scrollbar">
                            {displayImages.slice(0, 8).map((img, i) => (
                                <div
                                    key={i}
                                    className="snap-center shrink-0 w-full h-full relative cursor-pointer"
                                    onClick={() => handleOpen(i)}
                                >
                                    <Image
                                        src={img}
                                        alt={`Property view ${i + 1}`}
                                        fill
                                        fetchPriority={i === 0 ? 'high' : 'auto'}
                                        className="object-cover"
                                    />
                                </div>
                            ))}
                        </div>
                        {/* Dot indicators */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                            {displayImages.slice(0, 5).map((_, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/70" />
                            ))}
                            {displayImages.length > 5 && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                            )}
                        </div>
                        {/* Photo count badge */}
                        <button
                            onClick={() => handleOpen(0)}
                            className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm font-medium flex items-center gap-1.5 z-10"
                        >
                            <ImageIcon size={12} />
                            {displayImages.length}
                        </button>
                    </div>

                    {/* Desktop: Grid gallery */}
                    <div className={`hidden md:grid gap-2 h-[400px] rounded-xl overflow-hidden relative group ${gallerySubImages.length === 0 ? 'grid-cols-1' :
                        gallerySubImages.length === 1 ? 'grid-cols-2' :
                            'grid-cols-4 grid-rows-2'
                        }`}>
                        <div
                            className={`relative cursor-pointer overflow-hidden ${gallerySubImages.length >= 2 ? 'col-span-2 row-span-2' : ''}`}
                            onClick={() => handleOpen(0)}
                        >
                            <Image
                                src={mainImage}
                                alt="Main property view"
                                fill
                                fetchPriority="high"
                                className="object-cover hover:scale-105 transition-transform duration-500"
                            />
                        </div>
                        {gallerySubImages.map((img, i) => (
                            <div
                                key={i}
                                className="relative cursor-pointer overflow-hidden"
                                onClick={() => handleOpen(i + 1)}
                            >
                                <Image
                                    src={img}
                                    alt={`View ${i + 1}`}
                                    fill
                                    className="object-cover hover:scale-105 transition-transform duration-500"
                                />
                                {i === gallerySubImages.length - 1 && displayImages.length > 5 && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-sm backdrop-blur-sm z-10">
                                        +{displayImages.length - 5} photos
                                    </div>
                                )}
                            </div>
                        ))}
                        <button
                            onClick={() => handleOpen(0)}
                            className="absolute bottom-4 right-4 bg-white/90 backdrop-blur text-slate-900 border border-slate-200 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 shadow-sm hover:scale-105 transition-transform z-10"
                        >
                            <ImageIcon size={14} />
                            Show all photos
                        </button>
                    </div>
                </>
            )}

            {/* Lightbox Modal */}
            <AnimatePresence>
                {selectedIndex !== null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-[100] bg-black/98 flex flex-col outline-none"
                        onClick={handleClose}
                        onKeyDown={handleKeyDown}
                        tabIndex={0}
                        autoFocus
                    >
                        {/* Header */}
                        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/60 to-transparent">
                            <span className="text-white/80 text-sm font-medium ml-2">
                                {selectedIndex + 1} / {displayImages.length}
                            </span>
                            <div className="flex gap-4">
                                <button className="text-white/80 hover:text-white flex items-center gap-2 text-sm transition-colors">
                                    <ImageIcon size={18} />
                                    More Info
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="text-white/80 hover:text-white transition-colors p-1"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Main Image Area */}
                        <div className="flex-1 flex items-center justify-center relative w-full h-full p-4 md:pb-28">
                            <button
                                className="absolute left-2 md:left-4 p-2 md:p-3 bg-white/10 md:bg-white/5 hover:bg-white/20 md:hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors backdrop-blur-sm group z-20"
                                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                            >
                                <ChevronLeft size={24} className="md:w-8 md:h-8 group-hover:-translate-x-0.5 transition-transform" />
                            </button>

                            <button
                                className="absolute right-2 md:right-4 p-2 md:p-3 bg-white/10 md:bg-white/5 hover:bg-white/20 md:hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors backdrop-blur-sm group z-20"
                                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                            >
                                <ChevronRight size={24} className="md:w-8 md:h-8 group-hover:translate-x-0.5 transition-transform" />
                            </button>

                            {/* Main image */}
                            <div className="relative w-full h-full max-h-[80vh] md:max-h-[85vh]">
                                <Image
                                    key={selectedIndex}
                                    src={displayImages[selectedIndex]}
                                    alt={`Gallery view ${selectedIndex + 1}`}
                                    fill
                                    className="object-contain shadow-2xl select-none"
                                    onClick={(e) => e.stopPropagation()}
                                    draggable={false}
                                    priority
                                />
                            </div>
                        </div>

                        {/* Thumbnail Strip */}
                        <div
                            ref={thumbnailContainerRef}
                            className="bg-black/90 border-t border-white/10 p-4 hidden md:flex justify-center w-full absolute bottom-0 z-20 overflow-x-auto"
                            onClick={(e) => e.stopPropagation()}
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                            <div className="flex gap-2 max-w-full px-4">
                                {displayImages.map((img, idx) => (
                                    <button
                                        key={idx}
                                        data-index={idx}
                                        onClick={() => handleThumbnailClick(idx)}
                                        className={`relative w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-md overflow-hidden border-2
                                            ${selectedIndex === idx
                                                ? 'border-white opacity-100 scale-105'
                                                : 'border-transparent opacity-60 hover:opacity-90 hover:border-white/50'}
                                            transition-[border-color,opacity] duration-100`}
                                    >
                                        <Image
                                            src={img}
                                            alt={`Thumbnail ${idx + 1}`}
                                            fill
                                            className="object-cover"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default PropertyGallery;
