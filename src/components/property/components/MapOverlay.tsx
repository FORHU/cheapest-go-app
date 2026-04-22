import React from 'react';
import { Navigation, X, Search, Layers, Car, Bike, Footprints, Bus, ChevronRight, Star } from 'lucide-react';
import { WeatherWidget } from '../WeatherWidget';
import { formatDuration } from '@/utils/format';
import { GOOGLE_MAPS_SEARCH_URL } from '@/config/map-discovery';

interface MapOverlayProps {
    isFullscreen: boolean;
    showDirections: boolean;
    setShowDirections: (show: boolean) => void;
    setActivePoiId: (id: string | null) => void;
    setSelectedNativePoi: (poi: any) => void;
    setModalPoiId: (id: string | null) => void;
    originQuery: string;
    handleOriginSearch: (query: string) => void;
    showOriginResults: boolean;
    setShowOriginResults: (show: boolean) => void;
    originResults: any[];
    handleSelectOrigin: (origin: any) => void;
    isSearching: boolean;
    isLocating: boolean;
    handleLocateMe: () => void;
    clearSearch: () => void;
    clearDirections: () => void;
    transportProfile: string;
    setTransportProfile: (profile: any) => void;
    originTravelTime: number | null;
    originWalkingTime: number | null;
    originCyclingTime: number | null;
    isFetchingOriginRoute: boolean;
    poiTravelTime: number | null;
    poiWalkingTime: number | null;
    weather: any;
    isWeatherLoading: boolean;
    refetchWeather: () => void;
    showDetailsPanel: boolean;
    setShowDetailsPanel: (show: boolean) => void;
    displayInfo: any;
    selectedNativePoi: any;
    propertyName: string;
    hotelName: string;
    coordinates: { lat: number; lng: number } | undefined;
}

export const MapOverlay: React.FC<MapOverlayProps> = ({
    isFullscreen,
    showDirections,
    setShowDirections,
    setActivePoiId,
    setSelectedNativePoi,
    setModalPoiId,
    originQuery,
    handleOriginSearch,
    showOriginResults,
    setShowOriginResults,
    originResults,
    handleSelectOrigin,
    isSearching,
    isLocating,
    handleLocateMe,
    clearSearch,
    clearDirections,
    transportProfile,
    setTransportProfile,
    originTravelTime,
    originWalkingTime,
    originCyclingTime,
    isFetchingOriginRoute,
    poiTravelTime,
    poiWalkingTime,
    weather,
    isWeatherLoading,
    refetchWeather,
    showDetailsPanel,
    setShowDetailsPanel,
    displayInfo,
    selectedNativePoi,
    propertyName,
    hotelName,
    coordinates
}) => {
    return (
        <>
            <div className={`absolute top-3 left-4 z-40 flex flex-col items-start gap-2 md:top-4 transition-all duration-300
                ${isFullscreen ? 'w-[calc(100%-80px)] sm:w-auto max-w-[340px]' : 'w-[calc(100%-100px)] sm:w-[320px] scale-[0.9] sm:scale-100 origin-top-left'}
            `}>
                <div className="flex w-full items-start gap-1.5 sm:gap-2">
                    <div className="flex-1 min-w-0 sm:min-w-[280px]">
                        {!showDirections ? (
                            <button
                                onClick={() => {
                                    setShowDirections(true);
                                    setActivePoiId(null);
                                    setSelectedNativePoi(null);
                                }}
                                className={`w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer
                                    ${isFullscreen ? 'px-3 py-2 text-xs font-bold' : 'px-2.5 py-1.5 text-[10px] sm:text-xs font-semibold sm:font-bold'}
                                `}
                            >
                                <Navigation size={isFullscreen ? 14 : 12} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                <span className="truncate">Get directions...</span>
                            </button>
                        ) : (
                            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden transition-all duration-300">
                                <div className="flex items-center gap-2 px-2.5 py-1 border-b border-slate-100 dark:border-slate-800">
                                    <div className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                                    <div className="flex-1 relative">
                                        <input
                                            type="text"
                                            value={originQuery}
                                            onChange={(e) => handleOriginSearch(e.target.value)}
                                            onBlur={() => setTimeout(() => setShowOriginResults(false), 150)}
                                            onFocus={() => originResults.length > 0 && setShowOriginResults(true)}
                                            placeholder="Where from?"
                                            autoFocus
                                            className="w-full text-[10px] sm:text-xs text-slate-800 dark:text-slate-200 bg-transparent placeholder-slate-400 focus:outline-none py-0.5"
                                        />
                                        {isSearching && (
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {originQuery ? (
                                            <button onClick={clearSearch} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                                                <X size={14} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleLocateMe}
                                                disabled={isLocating}
                                                className="p-1 text-blue-500 hover:text-blue-600 transition-colors disabled:opacity-50"
                                            >
                                                {isLocating ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <Navigation size={14} fill="currentColor" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-2.5 py-1">
                                    <div className="w-2 h-2 bg-pink-500 rounded-full shrink-0" />
                                    <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 flex-1 truncate">{hotelName}</span>
                                    <button onClick={clearDirections} className="shrink-0 text-slate-400 hover:text-slate-600 p-0.5">
                                        <X size={12} />
                                    </button>
                                </div>

                                <div className="flex border-t border-slate-100 dark:border-slate-800">
                                    <button onClick={() => setTransportProfile('driving-traffic')} className={`flex-1 py-1 flex justify-center ${transportProfile === 'driving-traffic' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400'}`}><Car size={14} /></button>
                                    <button onClick={() => setTransportProfile('walking')} className={`flex-1 py-1 flex justify-center ${transportProfile === 'walking' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400'}`}><Footprints size={14} /></button>
                                    <button onClick={() => setTransportProfile('cycling')} className={`flex-1 py-1 flex justify-center ${transportProfile === 'cycling' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400'}`}><Bike size={14} /></button>
                                    <button
                                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${originQuery}&destination=${coordinates?.lat},${coordinates?.lng}&travelmode=transit`)}
                                        className="flex-1 py-1 flex justify-center text-slate-400"
                                    >
                                        <Bus size={14} />
                                    </button>
                                </div>
                                
                                {showOriginResults && originResults.length > 0 && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 max-h-40 overflow-y-auto">
                                        {originResults.map((r) => (
                                            <button key={r.id} onMouseDown={() => handleSelectOrigin(r)} className="w-full text-left px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 flex items-center gap-2 border-b last:border-0"><Search size={12} /><span className="truncate">{r.name}</span></button>
                                        ))}
                                    </div>
                                )}

                                {originQuery && !isFetchingOriginRoute && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 px-2 py-1 flex items-center gap-2">
                                        {originTravelTime !== null && transportProfile === 'driving-traffic' && (
                                            <div className="flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded text-blue-700 text-[10px] font-bold"><Car size={12} />{formatDuration(originTravelTime)}</div>
                                        )}
                                        {originWalkingTime !== null && transportProfile === 'walking' && (
                                            <div className="flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded text-emerald-700 text-[10px] font-bold"><Footprints size={12} />{formatDuration(originWalkingTime)}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <WeatherWidget weather={weather} isLoading={isWeatherLoading} onRefresh={refetchWeather} isFullscreen={isFullscreen} />
                </div>

                {!showDetailsPanel && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowDetailsPanel(true); }}
                        className={`bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 p-1.5 flex items-center gap-2 group ${isFullscreen ? 'px-3 py-2' : 'px-2.5 py-1.5'}`}
                    >
                        <Layers className="w-3.5 h-3.5 text-slate-700" />
                        <span className="text-[10px] font-semibold text-slate-700">Layers</span>
                    </button>
                )}
            </div>

            {displayInfo && !showDirections && (
                <div className="absolute top-20 left-4 sm:top-24 sm:left-6 z-10 w-[140px] sm:w-[180px] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700">
                    <div className="p-2 sm:p-3 relative">
                        <button onClick={() => { setActivePoiId(null); setSelectedNativePoi(null); }} className="absolute top-1 right-1 p-1 text-slate-400"><X size={14} /></button>
                        <div className="mt-1 space-y-1">
                            <h3 className="font-bold text-slate-900 dark:text-white text-[10px] sm:text-xs leading-tight">{displayInfo.name}</h3>
                            <p className="text-[9px] sm:text-[10px] text-slate-500">{displayInfo.address}</p>
                            {displayInfo.distance > 0 && <p className="text-[9px] text-slate-600 font-medium">{displayInfo.distance.toFixed(2)} km away</p>}
                            
                            {(poiTravelTime !== null || poiWalkingTime !== null) && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {poiTravelTime !== null && <div className="flex items-center gap-1 text-blue-600 text-[9px] font-bold"><Car size={10} />{formatDuration(poiTravelTime)}</div>}
                                    {poiWalkingTime !== null && <div className="flex items-center gap-1 text-emerald-600 text-[9px] font-bold"><Footprints size={10} />{formatDuration(poiWalkingTime)}</div>}
                                </div>
                            )}

                            <div className="pt-2 flex flex-col gap-1">
                                <a href={`${GOOGLE_MAPS_SEARCH_URL}&query=${encodeURIComponent(displayInfo.name)}`} target="_blank" className="text-[9px] font-bold text-blue-600 flex items-center gap-1">View on Maps <ChevronRight size={8} /></a>
                                {displayInfo.name !== hotelName && (
                                    <button onClick={() => setModalPoiId(displayInfo.name)} className="w-full py-1 bg-slate-100 rounded text-[9px] font-bold text-slate-700 flex items-center justify-center gap-1">Details <Star size={8} /></button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
