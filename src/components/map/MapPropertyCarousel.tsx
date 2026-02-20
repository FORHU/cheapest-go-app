'use client';

import React, { useRef, useEffect } from 'react';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { MappableProperty } from './types';

interface MapPropertyCarouselProps {
    properties: MappableProperty[];
    selectedId: string | null;
    onSelectId: (id: string | null) => void;
    onViewDetails: (id: string) => void;
}

export const MapPropertyCarousel: React.FC<MapPropertyCarouselProps> = ({
    properties,
    selectedId,
    onSelectId,
    onViewDetails,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Scroll to selected property when map marker is clicked
    useEffect(() => {
        if (selectedId && scrollRef.current) {
            const index = properties.findIndex(p => p.id === selectedId);
            if (index !== -1) {
                const cardWidth = 280; // Approximate card width + gap
                const gap = 16;
                const scrollLeft = index * (cardWidth + gap);

                scrollRef.current.scrollTo({
                    left: scrollLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [selectedId, properties]);

    return (
        <div
            ref={scrollRef}
            className="absolute bottom-4 left-0 right-0 z-50 flex gap-4 px-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2"
            style={{ scrollPaddingLeft: '1rem', scrollPaddingRight: '1rem' }}
        >
            {properties.map((property) => (
                <div
                    key={property.id}
                    id={`card-${property.id}`}
                    className={`snap-center shrink-0 w-[75vw] max-w-[280px] sm:w-[280px] bg-white dark:bg-slate-900 rounded-xl shadow-xl overflow-hidden border transition-all ${selectedId === property.id
                        ? 'border-blue-500 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800'
                        }`}
                    onClick={() => onSelectId(property.id)}
                >
                    <div className="flex h-24">
                        {/* Image — Airbnb-style rounded */}
                        <div className="w-24 h-full relative shrink-0 rounded-l-xl overflow-hidden">
                            <Image
                                src={property.image}
                                alt={property.name}
                                fill
                                className="object-cover"
                                sizes="96px"
                            />
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-3 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start gap-2">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 leading-tight">
                                        {property.name}
                                    </h3>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <Star size={10} className="fill-blue-500 text-blue-500" />
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                            {property.rating}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                                    {property.location}
                                </p>
                            </div>

                            <div className="flex items-end justify-between mt-1">
                                <div>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                                        ₱{property.price.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">/night</span>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onViewDetails(property.id);
                                    }}
                                    className="px-3 py-2 min-h-[36px] bg-blue-600 text-white text-xs font-bold rounded-full hover:bg-blue-700 transition-colors"
                                >
                                    View
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
