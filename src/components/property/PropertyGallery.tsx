"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PropertyGalleryProps {
    images: string[];
}

const PropertyGallery: React.FC<PropertyGalleryProps> = ({ images }) => {
    // Ensure we have at least some images to display
    const displayImages = images.length > 0 ? images : ['https://via.placeholder.com/800x600'];
    const mainImage = displayImages[0];
    const subImages = displayImages.slice(1, 5); // Take up to 4 more images

    // Lightbox State
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    // If not enough sub images, fill with placeholders or duplicates for layout
    const gallerySubImages = [...subImages];
    while (gallerySubImages.length < 4) {
        gallerySubImages.push(mainImage);
    }

    const handleOpen = (index: number) => setSelectedIndex(index);
    const handleClose = () => setSelectedIndex(null);

    const handlePrev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedIndex(prev => (prev === null ? null : prev === 0 ? displayImages.length - 1 : prev - 1));
    }, [displayImages.length]);

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedIndex(prev => (prev === null ? null : prev === displayImages.length - 1 ? 0 : prev + 1));
    }, [displayImages.length]);

    // Keyboard Navigation
    useEffect(() => {
        if (selectedIndex === null) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'ArrowRight') handleNext();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, handlePrev, handleNext]);

    return (
        <>
            {/* Grid Gallery */}
            <div className="grid grid-cols-4 grid-rows-2 h-[300px] md:h-[400px] gap-2 rounded-xl overflow-hidden relative group">
                <div
                    className="col-span-2 row-span-2 relative cursor-pointer overflow-hidden"
                    onClick={() => handleOpen(0)}
                >
                    <img
                        src={mainImage}
                        alt="Main property view"
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    />
                </div>
                {gallerySubImages.map((img, i) => (
                    <div
                        key={i}
                        className="relative cursor-pointer overflow-hidden"
                        onClick={() => handleOpen(i + 1)}
                    >
                        <img
                            src={img}
                            alt={`View ${i + 1}`}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                        />
                        {i === 3 && images.length > 5 && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-sm backdrop-blur-sm">
                                +{images.length - 5} photos
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

            {/* Lightbox Modal */}
            <AnimatePresence>
                {selectedIndex !== null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/98 flex flex-col"
                        onClick={handleClose}
                    >
                        {/* Header Controls */}
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
                            {/* Navigation Arrows */}
                            <button
                                className="absolute left-4 p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors hidden md:block backdrop-blur-sm group"
                                onClick={handlePrev}
                            >
                                <ChevronLeft size={32} className="group-hover:-translate-x-0.5 transition-transform" />
                            </button>

                            <button
                                className="absolute right-4 p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors hidden md:block backdrop-blur-sm group"
                                onClick={handleNext}
                            >
                                <ChevronRight size={32} className="group-hover:translate-x-0.5 transition-transform" />
                            </button>

                            <motion.img
                                key={selectedIndex}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.2 }}
                                src={displayImages[selectedIndex]}
                                alt={`Gallery view ${selectedIndex + 1}`}
                                className="max-h-full max-w-full object-contain shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>

                        {/* Thumbnail Strip */}
                        <div
                            className="bg-black/90 border-t border-white/10 p-4 hidden md:flex justify-center w-full absolute bottom-0 z-20 overflow-x-auto no-scrollbar"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex gap-2 max-w-full px-4">
                                {displayImages.map((img, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedIndex(idx)}
                                        className={`relative w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-md overflow-hidden transition-all duration-200 border-2 
                                            ${selectedIndex === idx
                                                ? 'border-white opacity-100 scale-105'
                                                : 'border-transparent opacity-50 hover:opacity-80 hover:border-white/50'}`}
                                    >
                                        <img
                                            src={img}
                                            alt={`Thumbnail ${idx + 1}`}
                                            className="w-full h-full object-cover"
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
