import React from 'react';
import { ChevronRight, ChevronLeft, Search, Star, Maximize, Minimize, Navigation, MapPin } from 'lucide-react';
import { POI_FILTERS } from '@/config/map-discovery';

import { cn } from '@/lib/utils';

const DISTANCE_OPTIONS = [
    { label: '1 km', value: 1000 },
    { label: '2 km', value: 2000 },
    { label: '5 km', value: 5000 },
    { label: '10 km', value: 10000 },
] as const;

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
    itineraryGems?: any[];
    toggleItineraryGem?: (poi: any) => void;
    handleOptimizeRoute?: () => void;
    isOptimizing?: boolean;
    hasOptimizedRoute?: boolean;
    radiusMeters?: number;
    onRadiusChange?: (r: number) => void;
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
    scrollGems,
    radiusMeters = 2000,
    onRadiusChange,
}) => {
    return (
        <div className={`transition-all duration-500 ease-in-out group/nearby flex flex-col gap-1 sm:gap-1.5
            ${isFullscreen
                ? 'fixed bottom-4 left-1/2 -translate-x-1/2 w-[98%] sm:w-[94%] z-[10001] px-2'
                : 'relative lg:absolute lg:bottom-2 lg:left-1/2 lg:-translate-x-1/2 lg:w-[96%] lg:z-30 w-full mt-3 lg:mt-0'
            }
        `}>
            {/* Controls row: category + distance + fullscreen */}
            <div className="flex items-center justify-between gap-2 w-full px-1 sm:px-2 pb-1 lg:px-0 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">

                {/* Category Filter Dropdown */}
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

                {/* Distance Filter */}
                {onRadiusChange && (
                    <div className="flex items-center gap-0.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full h-7 px-2 shadow-md">
                        <MapPin size={10} className="text-blue-500 mr-0.5 shrink-0" />
                        {DISTANCE_OPTIONS.map(({ label, value }) => (
                            <button
                                key={value}
                                onClick={() => onRadiusChange(value)}
                                className={cn(
                                    'px-1.5 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer whitespace-nowrap',
                                    radiusMeters === value
                                        ? 'bg-blue-600 text-white'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-blue-500'
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}

                </div>{/* end left controls */}

                {isFullscreen && (
                    <div className="flex items-center gap-1.5">
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
                )}
            </div>

            <div className="relative flex flex-row w-full group/imagebar">
                {nearbyGems.length > 0 && (
                    <button
                        onClick={() => scrollGems('left')}
                        className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-40 w-6 h-6 items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/imagebar:opacity-100"
                    >
                        <ChevronLeft size={12} />
                    </button>
                )}

                <div
                    ref={gemsScrollRef}
                    className="flex gap-2.5 overflow-x-auto no-scrollbar scroll-smooth px-1 py-1.5 w-full flex-row"
                >
                    {((isFetchingGems && nearbyGems.length === 0) ? Array(12).fill(0) : nearbyGems.filter(poi => 
                        poi.properties?.isStub || 
                        poi.properties?.rating === undefined || 
                        poi.properties?.rating === null || 
                        poi.properties?.rating >= 3
                    )).map((poi, idx) => {
                        if (isFetchingGems && nearbyGems.length === 0) {
                            return (
                                <div key={idx} className="flex-shrink-0 w-36 h-24 sm:w-48 sm:h-32 bg-slate-200/80 dark:bg-slate-800/80 rounded-2xl animate-pulse shadow-sm border border-slate-100 dark:border-slate-700/50" />
                            );
                        }
                        
                        const name = poi.properties?.name || poi.name;
                        const isActive = activePoiId === name;
                        const lng = poi.geometry?.coordinates[0] || poi.coordinates?.lng;
                        const lat = poi.geometry?.coordinates[1] || poi.coordinates?.lat;
                        const category = (poi.properties?.category || poi.category || '').toLowerCase();
                        const PoiIcon = poi.properties?.icon || poi.icon || Search;

                        const ratingValue = Number(poi.properties?.rating);
                        const ratingDisplay = Number.isFinite(ratingValue) && ratingValue > 0
                            ? (Number.isInteger(ratingValue) ? ratingValue.toString() : ratingValue.toFixed(1))
                            : null;

                        // Category → background gradient (no images needed)
                        const cardBg =
                            category.includes('park') || category.includes('garden') || category.includes('nature')
                                ? 'from-emerald-800 to-emerald-950'
                            : category.includes('restaurant') || category.includes('cafe') || category.includes('food') || category.includes('bar')
                                ? 'from-orange-700 to-orange-950'
                            : category.includes('museum') || category.includes('tourist') || category.includes('landmark') || category.includes('attraction') || category.includes('art')
                                ? 'from-indigo-700 to-indigo-950'
                            : category.includes('shop') || category.includes('market') || category.includes('supermarket')
                                ? 'from-pink-700 to-pink-950'
                            : category.includes('transit') || category.includes('station') || category.includes('bus') || category.includes('train')
                                ? 'from-slate-600 to-slate-900'
                            : category.includes('hospital') || category.includes('pharmacy') || category.includes('medical')
                                ? 'from-blue-700 to-blue-950'
                            : 'from-slate-700 to-slate-950';

                        return (
                            <div
                                key={`${name}-${idx}`}
                                onClick={() => {
                                    if (isActive) {
                                        setActivePoiId(null);
                                        setSelectedNativePoi(null);
                                    } else {
                                        setSelectedNativePoi(poi);
                                        setActivePoiId(name);
                                        mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, pitch: 45, duration: 800 });
                                    }
                                }}
                                className={`group relative shrink-0 transition-all duration-300 ease-out cursor-pointer
                                w-36 h-24 sm:w-48 sm:h-32
                                bg-linear-to-br ${cardBg}
                                ${isActive
                                    ? 'ring-[3px] ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 shadow-2xl z-10 scale-[1.02]'
                                    : 'shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                                }
                                rounded-2xl overflow-hidden
                                ${isFetchingGems ? 'animate-pulse opacity-80' : ''}
                            `}
                            >
                                {/* Photo — falls back gracefully to the gradient bg */}
                                <img
                                    src={poi.properties?.imageUrl || poi.imageUrl}
                                    alt={name}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                                {/* Gradient overlay so text is always readable */}
                                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                                {/* Large centred icon — shows through when no photo */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <PoiIcon size={36} className="text-white/20" />
                                </div>

                                {/* Rating badge */}
                                {ratingDisplay !== null && (
                                    <div className="absolute top-2 left-2 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md rounded-full px-1.5 py-0.5 flex items-center gap-1 shadow-sm">
                                        <Star size={9} className="text-blue-500 fill-blue-500" />
                                        <span className="text-[10px] font-extrabold text-slate-800 dark:text-white tracking-tight">{ratingDisplay}</span>
                                    </div>
                                )}

                                {/* Name + category */}
                                <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
                                    <div className="flex items-center gap-1 mb-0.5 opacity-70">
                                        <PoiIcon size={9} className="shrink-0 text-white" />
                                        <span className="text-[8px] font-bold uppercase tracking-widest text-white truncate">
                                            {poi.properties?.displayCategory || poi.properties?.category || poi.category}
                                        </span>
                                    </div>
                                    <h4 className="text-[11px] sm:text-[13px] font-black leading-tight line-clamp-2 text-white drop-shadow">
                                        {poi.properties?.translatedName || poi.properties?.name || name}
                                    </h4>
                                </div>

                                {/* Details button on hover */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedNativePoi(poi);
                                        setModalPoiId(name);
                                    }}
                                    className="absolute bottom-2 right-2 px-2 py-0.5 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-lg text-[8px] font-bold uppercase tracking-wider text-white border border-white/20 transition-all opacity-0 group-hover:opacity-100 z-20"
                                >
                                    Details
                                </button>

                                {isActive && (
                                    <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-lg">
                                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {nearbyGems.length > 0 && (
                    <button
                        onClick={() => scrollGems('right')}
                        className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-40 w-6 h-6 items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/imagebar:opacity-100"
                    >
                        <ChevronRight size={12} />
                    </button>
                )}
            </div>
        </div>
    );
};
