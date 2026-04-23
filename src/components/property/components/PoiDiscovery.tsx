import React from 'react';
import Image from 'next/image';
import { ChevronRight, ChevronLeft, Search, Star, Maximize, Minimize, Navigation } from 'lucide-react';
import { POI_FILTERS } from '@/config/map-discovery';
import { getMapboxPoiImage } from '@/utils/images';

interface PoiDiscoveryProps {
    isFullscreen: boolean;
    selectedCategory: string;
    setSelectedCategory: (cat: string) => void;
    isCategoryDropdownOpen: boolean;
    setIsCategoryDropdownOpen: (open: boolean) => void;
    handleRecenter: () => void;
    setIsFullscreen: (full: boolean | ((f: boolean) => boolean)) => void;
    nearbyGems: any[];
    isFetchingGems: boolean;
    activePoiId: string | null;
    setActivePoiId: (id: string | null) => void;
    setSelectedNativePoi: (poi: any) => void;
    setModalPoiId: (id: string | null) => void;
    mapRef: React.RefObject<any>;
    gemsScrollRef: React.RefObject<HTMLDivElement | null>;
    scrollGems: (direction: 'left' | 'right') => void;
}

export const PoiDiscovery: React.FC<PoiDiscoveryProps> = ({
    isFullscreen,
    selectedCategory,
    setSelectedCategory,
    isCategoryDropdownOpen,
    setIsCategoryDropdownOpen,
    handleRecenter,
    setIsFullscreen,
    nearbyGems,
    isFetchingGems,
    activePoiId,
    setActivePoiId,
    setSelectedNativePoi,
    setModalPoiId,
    mapRef,
    gemsScrollRef,
    scrollGems
}) => {
    return (
        <div className={`transition-all duration-500 ease-in-out group/nearby flex flex-col gap-1 sm:gap-1.5
            ${isFullscreen
                ? 'fixed bottom-4 left-1/2 -translate-x-1/2 w-[98%] sm:w-[94%] z-[10001] px-2'
                : 'relative lg:absolute lg:bottom-2 lg:left-1/2 lg:-translate-x-1/2 lg:w-[96%] lg:z-30 w-full mt-3 lg:mt-0'
            }
        `}>
            {/* Category Filter Dropdown & Controls */}
            <div className="flex items-center justify-between gap-2 w-full px-1 sm:px-2 pb-1 lg:px-0">
                <div className="relative">
                    <button
                        onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-slate-200 dark:border-slate-700 text-slate-700 dark:text-white shadow-lg hover:border-blue-400 transition-all active:scale-95 group"
                    >
                        {React.createElement(POI_FILTERS.find(f => f.id === selectedCategory)?.icon || Search, { size: 14, className: 'text-blue-500' })}
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                            {POI_FILTERS.find(f => f.id === selectedCategory)?.label || 'Discovery'}
                        </span>
                        <ChevronRight size={14} className={`text-slate-400 transition-transform duration-300 ${isCategoryDropdownOpen ? '-rotate-90' : 'rotate-90'}`} />
                    </button>

                    {isCategoryDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsCategoryDropdownOpen(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-48 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                <div className="p-1.5 space-y-0.5">
                                    <div className="px-3 py-1.5 mb-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Select Mode</div>
                                    {POI_FILTERS.map(filter => {
                                        const isSelected = selectedCategory === filter.id;
                                        const Icon = filter.icon;
                                        return (
                                            <button
                                                key={filter.id}
                                                onClick={() => {
                                                    setSelectedCategory(filter.id);
                                                    setIsCategoryDropdownOpen(false);
                                                }}
                                                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl transition-all duration-200 group/item
                                                    ${isSelected 
                                                        ? 'bg-blue-600 text-white shadow-md' 
                                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <Icon size={14} className={isSelected ? 'text-white' : 'text-slate-400 group-hover/item:text-blue-500'} />
                                                    <span className="text-[11px] font-bold uppercase tracking-normal">{filter.label}</span>
                                                </div>
                                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className={`flex items-center gap-1.5 shrink-0`}>
                    <button
                        onClick={() => setIsFullscreen(f => !f)}
                        className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 p-1.5 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center"
                        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                    </button>
                    <button
                        onClick={handleRecenter}
                        className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-blue-600 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 p-1.5 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center"
                        title="Recenter Map"
                    >
                        <Navigation size={14} fill="currentColor" />
                    </button>
                </div>
            </div>

            <div className="relative flex flex-row w-full group/imagebar">
                {nearbyGems.length > 0 && (
                    <button
                        onClick={() => scrollGems('left')}
                        className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-40 w-8 h-8 items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/imagebar:opacity-100"
                    >
                        <ChevronLeft size={16} />
                    </button>
                )}

                <div
                    ref={gemsScrollRef}
                    className="flex gap-1.5 overflow-x-auto no-scrollbar scroll-smooth px-0.5 py-0.5 w-full flex-row"
                >
                    {(isFetchingGems ? Array(12).fill(0) : nearbyGems.filter(poi => poi.properties?.isStub || (poi.properties?.rating && poi.properties?.rating >= 3))).map((poi, idx) => {
                        if (isFetchingGems) {
                            return <div key={idx} className="flex-shrink-0 w-32 h-20 sm:w-40 sm:h-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />;
                        }
                        const name = poi.properties?.name || poi.name;
                        const isActive = activePoiId === name;
                        const lng = poi.geometry?.coordinates[0] || poi.coordinates.lng;
                        const lat = poi.geometry?.coordinates[1] || poi.coordinates.lat;
                        const category = poi.properties?.category || poi.category;
                        const imageUrl = poi.properties?.imageUrl || (poi.imageUrl || getMapboxPoiImage(name, lat, lng, category));
                        const ratingValue = Number(poi.properties?.rating);
                        const ratingDisplay = Number.isFinite(ratingValue) ? Math.round(ratingValue) : null;

                        return (
                            <button
                                key={`${name}-${idx}`}
                                onClick={() => {
                                    if (isActive) {
                                        setActivePoiId(null);
                                        setSelectedNativePoi(null);
                                    } else {
                                        setSelectedNativePoi(poi);
                                        setActivePoiId(name);
                                        setModalPoiId(name);
                                        mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, pitch: 45, duration: 800 });
                                    }
                                }}
                                className={`group relative flex-shrink-0 transition-all duration-300 transform hover:scale-[1.03] active:scale-95
                                w-32 h-20 sm:w-40 sm:h-24
                                ${isActive ? 'ring-2 ring-blue-500 shadow-xl' : 'shadow-md'}
                                rounded-xl overflow-hidden
                            `}
                            >
                                <Image
                                    src={imageUrl}
                                    alt={name}
                                    fill
                                    sizes="(max-width: 640px) 128px, 160px"
                                    className={`object-cover transition-transform duration-500 group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />
                                {ratingDisplay !== null && (
                                    <div className="absolute top-2 left-2 bg-black/40 backdrop-blur-md rounded-full px-2 py-0.5 flex items-center gap-1 border border-white/20 shadow-sm">
                                        <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                        <span className="text-[10px] font-bold text-white tracking-tight">{ratingDisplay}</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 p-3 flex flex-col justify-end items-start text-white text-left">
                                    <div className="flex items-center gap-1 mb-1 opacity-95 drop-shadow-sm">
                                        {React.createElement(poi.properties?.icon || poi.icon || Search, { size: 10, className: 'shrink-0' })}
                                        <span className="text-[9px] font-semibold uppercase tracking-wider truncate">{poi.properties?.displayCategory || poi.properties?.category || poi.category}</span>
                                    </div>
                                    <h4 className="text-[10px] sm:text-xs font-bold leading-tight line-clamp-2 drop-shadow-md">
                                        {poi.properties?.translatedName || poi.properties?.name || name}
                                    </h4>
                                </div>
                                {isActive && (
                                    <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full border border-white">
                                        <div className="w-2 h-2 bg-white rounded-full" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {nearbyGems.length > 0 && (
                    <button
                        onClick={() => scrollGems('right')}
                        className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-40 w-8 h-8 items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/imagebar:opacity-100"
                    >
                        <ChevronRight size={16} />
                    </button>
                )}
            </div>
        </div>
    );
};
