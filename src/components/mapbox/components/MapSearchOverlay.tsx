'use client';

import React from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { useMapboxSearch, type SearchResult } from '../hooks/useMapboxSearch';

interface MapSearchOverlayProps {
    onSelect: (result: SearchResult) => void;
    className?: string;
}

export const MapSearchOverlay = ({ onSelect, className = 'absolute top-3 left-3 z-10 w-[72%]' }: MapSearchOverlayProps) => {
    const [userLocation, setUserLocation] = React.useState<{ lat: number; lng: number } | undefined>();

    React.useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserLocation({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                });
            },
            (err) => console.warn('Geolocation failed:', err),
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
    }, []);

    const {
        originQuery,
        originResults,
        showOriginResults,
        setShowOriginResults,
        isSearching,
        handleOriginSearch,
        handleSelectOrigin,
        clearSearch,
    } = useMapboxSearch({ proximity: userLocation });

    const handlePick = (result: SearchResult) => {
        handleSelectOrigin(result);
        onSelect(result);
    };

    return (
        <div className={className}>
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg pointer-events-auto">
                <div className="flex items-center gap-2 px-3 py-2.5">
                    {isSearching ? (
                        <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : (
                        <Search size={13} className="text-slate-400 shrink-0" />
                    )}
                    <input
                        type="text"
                        value={originQuery}
                        onChange={(e) => handleOriginSearch(e.target.value)}
                        onBlur={() => setTimeout(() => setShowOriginResults(false), 150)}
                        onFocus={() => originResults.length > 0 && setShowOriginResults(true)}
                        placeholder="Search location on map..."
                        className="flex-1 text-xs text-slate-800 dark:text-slate-200 bg-transparent placeholder-slate-400 focus:outline-none"
                    />
                    {originQuery && (
                        <button onClick={clearSearch} className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <X size={13} />
                        </button>
                    )}
                </div>

                {showOriginResults && originResults.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-slate-800 max-h-48 overflow-y-auto rounded-b-xl">
                        {originResults.map((r) => (
                            <button
                                key={r.id}
                                onMouseDown={() => handlePick(r)}
                                className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
                            >
                                <MapPin size={10} className="text-slate-400 shrink-0" />
                                <span className="line-clamp-1">{r.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
