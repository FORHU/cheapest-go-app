'use client';

import React, { useCallback, useRef } from 'react';
import { Hotel, List } from 'lucide-react';
import { MapPropertyCard } from './MapPropertyCard';
import type { MappableProperty } from './types';

interface PropertyMapListProps {
    properties: MappableProperty[];
    selectedId: string | null;
    hoveredId: string | null;
    onSelect: (id: string) => void;
    onHover: (id: string | null) => void;
    title?: string;
}

const PropertyMapList = React.memo(function PropertyMapList({
    properties,
    selectedId,
    hoveredId,
    onSelect,
    onHover,
    title,
}: PropertyMapListProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-950">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <Hotel className="w-4 h-4 text-blue-500" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        {title || 'Properties'}
                    </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {properties.length} {properties.length === 1 ? 'property' : 'properties'} found
                </p>
            </div>

            {/* Scrollable list */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overscroll-contain"
            >
                {properties.length > 0 ? (
                    properties.map((property) => (
                        <MapPropertyCard
                            key={property.id}
                            property={property}
                            isSelected={selectedId === property.id}
                            isHovered={hoveredId === property.id}
                            onSelect={onSelect}
                            onHover={onHover}
                        />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <List className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            No properties to show
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            Try adjusting your search filters
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
});

/** Scroll a property card into view in the list */
function scrollToProperty(containerId: string, propertyId: string) {
    const container = document.getElementById(containerId);
    const card = container?.querySelector(`[data-property-id="${propertyId}"]`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

export { PropertyMapList, scrollToProperty };
export type { PropertyMapListProps };
