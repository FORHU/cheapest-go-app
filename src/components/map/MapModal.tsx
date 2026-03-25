'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import dynamic from 'next/dynamic';
// import { SearchMapContainer } from '@/components/mapbox/SearchMapContainer';

const SearchMapContainer = dynamic(
    () => import('@/components/mapbox/SearchMapContainer').then((mod) => mod.SearchMapContainer),
    {
        ssr: false,
        loading: () => (
            <div className="flex-1 h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
                <div className="animate-pulse text-sm text-slate-500 font-medium">Loading map...</div>
            </div>
        ),
    }
);

import { MapPropertyCarousel } from './MapPropertyCarousel';
import type { MappableProperty } from './types';

interface MapModalProps {
    isOpen: boolean;
    onClose: () => void;
    properties: MappableProperty[];
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
    hoveredId: string | null;
    onHoverId: (id: string | null) => void;
    onViewDetails: (id: string) => void;
}

export function MapModal({
    isOpen,
    onClose,
    properties,
    selectedId,
    onSelectId,
    hoveredId,
    onHoverId,
    onViewDetails,
}: MapModalProps) {
    useBodyScrollLock(isOpen);

    // Create portal to ensure it's on top of everything
    // In Next.js we need to check if document exists or use a mounted check, 
    // but typically raw conditional rendering works if purely client-side triggered.
    // Ideally we put this in document.body

    // For simplicity with AnimatePresence, we return the structure here 
    // and let the parent handle the conditional rendering OR simpler:
    // we use AnimatePresence inside the component if we want the exit animation to work 
    // when 'isOpen' becomes false.

    // However, since we are using 'createPortal', we need to be careful with SSR.
    // Assuming this is only rendered on client.

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed inset-0 z-[100] bg-white dark:bg-slate-950 flex flex-col"
                >
                    {/* Header / Close button area */}
                    <div className="absolute top-4 left-4 z-50">
                        <button
                            onClick={onClose}
                            className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-2.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95"
                            aria-label="Close map"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Map Content */}
                    <div className="flex-1 relative h-full w-full">
                        <SearchMapContainer
                            properties={properties}
                            selectedId={selectedId}
                            onSelectId={onSelectId}
                            hoveredId={hoveredId}
                            onHoverId={onHoverId}
                            onViewDetails={onViewDetails}
                        />
                    </div>

                    {/* Property Carousel */}
                    <MapPropertyCarousel
                        properties={properties}
                        selectedId={selectedId}
                        onSelectId={onSelectId}
                        onViewDetails={onViewDetails}
                    />

                    {/* Floating pill for property count - Repositioned to top right */}
                    <div className="absolute top-4 right-4 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 pointer-events-none">
                        <div className="flex items-center gap-1.5">
                            <MapPin size={12} className="text-blue-500" />
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {properties.length} places
                            </span>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
