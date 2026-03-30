'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Map } from '@/components/ui/map';
import type { StandardStyleConfig } from '@/components/ui/map';
import { Marker, Popup, NavigationControl, GeolocateControl } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import {
    Star,
    Hotel,
    X,
    Layers,
    Search,
    MapPin,
    Loader2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────

interface HotelMarker {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    price: string;
    rating: number;
    image: string;
    category: string;
}

type MapTypeId = 'default-3d' | 'default' | 'satellite';

interface MapDetailToggle {
    id: string;
    label: string;
    icon: string;
    enabled: boolean;
}

// ── Constants ──────────────────────────────────────────

import { env } from '@/utils/env';

const HOTELS: HotelMarker[] = [
    {
        id: 1,
        name: 'Grand Hyatt Seoul',
        latitude: 37.5391,
        longitude: 126.9972,
        price: '₩350,000',
        rating: 4.7,
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=300&h=200&fit=crop',
        category: 'Luxury',
    },
    {
        id: 2,
        name: 'Lotte Hotel Seoul',
        latitude: 37.5653,
        longitude: 126.981,
        price: '₩280,000',
        rating: 4.5,
        image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=300&h=200&fit=crop',
        category: 'Luxury',
    },
    {
        id: 3,
        name: 'The Shilla Seoul',
        latitude: 37.5562,
        longitude: 127.0053,
        price: '₩420,000',
        rating: 4.8,
        image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=300&h=200&fit=crop',
        category: 'Luxury',
    },
    {
        id: 4,
        name: 'Four Seasons Seoul',
        latitude: 37.5726,
        longitude: 126.9762,
        price: '₩380,000',
        rating: 4.9,
        image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=300&h=200&fit=crop',
        category: 'Luxury',
    },
    {
        id: 5,
        name: 'Signiel Seoul',
        latitude: 37.5126,
        longitude: 127.1024,
        price: '₩500,000',
        rating: 4.9,
        image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=300&h=200&fit=crop',
        category: 'Ultra Luxury',
    },
    {
        id: 6,
        name: 'JW Marriott Dongdaemun',
        latitude: 37.5665,
        longitude: 127.0092,
        price: '₩260,000',
        rating: 4.4,
        image: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=300&h=200&fit=crop',
        category: 'Premium',
    },
    {
        id: 7,
        name: 'Park Hyatt Seoul',
        latitude: 37.5085,
        longitude: 127.0593,
        price: '₩450,000',
        rating: 4.8,
        image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=300&h=200&fit=crop',
        category: 'Luxury',
    },
    {
        id: 8,
        name: 'Novotel Ambassador Gangnam',
        latitude: 37.505,
        longitude: 127.024,
        price: '₩180,000',
        rating: 4.2,
        image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=300&h=200&fit=crop',
        category: 'Business',
    },
    {
        id: 9,
        name: 'Conrad Seoul',
        latitude: 37.5249,
        longitude: 126.926,
        price: '₩320,000',
        rating: 4.6,
        image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=300&h=200&fit=crop',
        category: 'Premium',
    },
    {
        id: 10,
        name: 'Ibis Styles Myeongdong',
        latitude: 37.5611,
        longitude: 126.987,
        price: '₩95,000',
        rating: 3.9,
        image: 'https://images.unsplash.com/photo-1590490360182-c33d955dca7d?w=300&h=200&fit=crop',
        category: 'Budget',
    },
];

function getCategoryColor(category: string) {
    switch (category) {
        case 'Ultra Luxury':
            return 'bg-amber-500';
        case 'Luxury':
            return 'bg-purple-500';
        case 'Premium':
            return 'bg-blue-500';
        case 'Business':
            return 'bg-emerald-500';
        case 'Budget':
            return 'bg-gray-500';
        default:
            return 'bg-gray-500';
    }
}

// SVG icons for map detail tiles (matching Google Maps style)
function TransitIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="6" y="3" width="12" height="15" rx="2" />
            <circle cx="9" cy="14" r="1" fill="currentColor" />
            <circle cx="15" cy="14" r="1" fill="currentColor" />
            <path d="M9 18l-1 3M15 18l1 3M6 10h12" />
        </svg>
    );
}

function TrafficIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="7" y="2" width="10" height="20" rx="3" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" className="text-red-400" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" className="text-yellow-400" />
            <circle cx="12" cy="17" r="1.5" fill="currentColor" className="text-green-400" />
        </svg>
    );
}

function BikingIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="6" cy="17" r="3" />
            <circle cx="18" cy="17" r="3" />
            <path d="M6 17l4-8 4 8M10 9h4l4 8" />
            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
        </svg>
    );
}

function TerrainIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M2 20l7-12 5 8 3-4 5 8H2z" fill="currentColor" fillOpacity={0.15} />
            <path d="M2 20l7-12 5 8 3-4 5 8" />
        </svg>
    );
}

// ── Place Search Bar ─────────────────────────────────

interface GeocoderFeature {
    id: string;
    place_name: string;
    center: [number, number]; // [lng, lat]
    place_type: string[];
    text: string;
}

function PlaceSearchBar({
    onSelect,
}: {
    onSelect: (lng: number, lat: number, name: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<GeocoderFeature[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const searchPlaces = useCallback(async (text: string) => {
        if (text.length < 2) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        setIsLoading(true);
        try {
            const token = env.MAPBOX_TOKEN;
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?access_token=${token}&limit=5&types=place,locality,neighborhood,address,poi`
            );
            const data = await res.json();
            setResults(data.features || []);
            setIsOpen(true);
        } catch {
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleInputChange = useCallback(
        (value: string) => {
            setQuery(value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => searchPlaces(value), 300);
        },
        [searchPlaces]
    );

    const handleSelect = useCallback(
        (feature: GeocoderFeature) => {
            setQuery(feature.place_name);
            setIsOpen(false);
            setResults([]);
            onSelect(feature.center[0], feature.center[1], feature.place_name);
        },
        [onSelect]
    );

    function getPlaceIcon(types: string[]) {
        if (types.includes('poi')) return <MapPin className="w-4 h-4 text-red-400 flex-shrink-0" />;
        return <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    }

    return (
        <div ref={containerRef} className="relative w-full max-w-md">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => results.length > 0 && setIsOpen(true)}
                    placeholder="Search places..."
                    className="w-full pl-9 pr-9 py-2.5 bg-white rounded-xl border border-gray-200 shadow-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                )}
                {!isLoading && query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            setResults([]);
                            setIsOpen(false);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                    >
                        <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                    </button>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden z-30">
                    {results.map((feature) => (
                        <button
                            key={feature.id}
                            onClick={() => handleSelect(feature)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                            {getPlaceIcon(feature.place_type)}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                    {feature.text}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {feature.place_name}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Map Details Panel ────────────────────────────────

interface MapTypeTile {
    id: MapTypeId;
    label: string;
    thumbnail: string;
}

const MAP_TYPE_TILES: MapTypeTile[] = [
    {
        id: 'default-3d',
        label: 'Default 3D',
        thumbnail: 'linear-gradient(135deg, #d4e4c8 0%, #c8d8bc 30%, #e8dcc8 60%, #ddd5c8 100%)',
    },
    {
        id: 'default',
        label: 'Default',
        thumbnail: 'linear-gradient(135deg, #f0f0e8 0%, #e0e0d0 30%, #f5f5ed 60%, #fafafa 100%)',
    },
    {
        id: 'satellite',
        label: 'Satellite',
        thumbnail: 'linear-gradient(135deg, #2a4a2a 0%, #1a3a2a 30%, #1a2e1a 60%, #0f1f0f 100%)',
    },
];

function MapDetailsPanel({
    isOpen,
    onClose,
    mapType,
    onMapTypeChange,
    details,
    onDetailToggle,
    showLabels,
    onLabelsToggle,
}: {
    isOpen: boolean;
    onClose: () => void;
    mapType: MapTypeId;
    onMapTypeChange: (type: MapTypeId) => void;
    details: MapDetailToggle[];
    onDetailToggle: (id: string) => void;
    showLabels: boolean;
    onLabelsToggle: () => void;
}) {
    if (!isOpen) return null;

    const detailIcons: Record<string, React.ReactNode> = {
        transit: <TransitIcon />,
        traffic: <TrafficIcon />,
        biking: <BikingIcon />,
        terrain: <TerrainIcon />,
    };

    return (
        <div className="absolute top-3 left-3 z-20 bg-white rounded-2xl shadow-xl border border-gray-200 w-[300px] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h3 className="text-base font-semibold text-gray-900">Map details</h3>
                <button
                    onClick={onClose}
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5 text-gray-500" />
                </button>
            </div>

            {/* Map details toggles */}
            <div className="px-4 pb-3">
                <div className="grid grid-cols-3 gap-2">
                    {details.map((detail) => (
                        <button
                            key={detail.id}
                            onClick={() => onDetailToggle(detail.id)}
                            className={`
                                flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all cursor-pointer
                                ${
                                    detail.enabled
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 bg-white hover:bg-gray-50'
                                }
                            `}
                        >
                            <div
                                className={`${
                                    detail.enabled ? 'text-blue-600' : 'text-gray-500'
                                }`}
                            >
                                {detailIcons[detail.id]}
                            </div>
                            <span
                                className={`text-[11px] font-medium ${
                                    detail.enabled ? 'text-blue-700' : 'text-gray-600'
                                }`}
                            >
                                {detail.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Map type */}
            <div className="px-4 pb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Map type
                </p>
                <div className="grid grid-cols-3 gap-2">
                    {MAP_TYPE_TILES.map((tile) => (
                        <button
                            key={tile.id}
                            onClick={() => onMapTypeChange(tile.id)}
                            className={`
                                flex flex-col items-center gap-1.5 rounded-xl border-2 overflow-hidden transition-all cursor-pointer
                                ${
                                    mapType === tile.id
                                        ? 'border-blue-500'
                                        : 'border-gray-200 hover:border-gray-300'
                                }
                            `}
                        >
                            <div
                                className="w-full h-14 bg-cover bg-center"
                                style={{ background: tile.thumbnail }}
                            />
                            <span
                                className={`text-[11px] font-medium pb-1.5 ${
                                    mapType === tile.id ? 'text-blue-700' : 'text-gray-600'
                                }`}
                            >
                                {tile.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Labels toggle */}
            <div className="px-4 pb-4 flex items-center justify-between">
                <span className="text-sm text-gray-700">Labels</span>
                <button
                    onClick={onLabelsToggle}
                    className={`
                        relative w-10 h-5 rounded-full transition-colors cursor-pointer
                        ${showLabels ? 'bg-blue-500' : 'bg-gray-300'}
                    `}
                >
                    <span
                        className={`
                            absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                            ${showLabels ? 'translate-x-5' : 'translate-x-0'}
                        `}
                    />
                </button>
            </div>
        </div>
    );
}

// ── Page Component ─────────────────────────────────────

export default function TestMapPage() {
    const [selectedHotel, setSelectedHotel] = useState<HotelMarker | null>(null);
    const [hoveredHotel, setHoveredHotel] = useState<number | null>(null);
    const [mapType, setMapType] = useState<MapTypeId>('default-3d');
    const [showDetailsPanel, setShowDetailsPanel] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [mapDetails, setMapDetails] = useState<MapDetailToggle[]>([
        { id: 'transit', label: 'Transit', icon: 'transit', enabled: false },
        { id: 'traffic', label: 'Traffic', icon: 'traffic', enabled: false },
        { id: 'biking', label: 'Biking', icon: 'biking', enabled: false },
        { id: 'terrain', label: 'Terrain', icon: 'terrain', enabled: false },
    ]);
    const mapRef = useRef<MapRef>(null);

    const terrainEnabled = mapDetails.find((d) => d.id === 'terrain')?.enabled ?? false;
    const isStandardStyle = mapType === 'default-3d';
    const isDarkMap = mapType === 'satellite';

    const handleDetailToggle = useCallback((id: string) => {
        setMapDetails((prev) =>
            prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d))
        );
    }, []);

    // Resolve mapbox style URL based on map type
    const mapStyleUrl = useMemo(() => {
        if (mapType === 'satellite') {
            return 'mapbox://styles/mapbox/satellite-v9';
        }
        if (mapType === 'default') {
            return 'mapbox://styles/mapbox/streets-v12';
        }
        // default-3d uses the Standard style
        return 'standard';
    }, [mapType]);

    const standardConfig = useMemo<StandardStyleConfig>(
        () => ({
            lightPreset: 'day',
            show3dObjects: true,
            show3dBuildings: true,
            show3dTrees: true,
            show3dLandmarks: true,
            show3dFacades: true,
            showPointOfInterestLabels: showLabels,
            showRoadLabels: showLabels,
            showTransitLabels: showLabels,
            showPlaceLabels: showLabels,
        }),
        [showLabels]
    );

    const flyToHotel = useCallback((hotel: HotelMarker) => {
        mapRef.current?.flyTo({
            center: [hotel.longitude, hotel.latitude],
            zoom: 18.5,
            pitch: 60,
            bearing: -30,
            duration: 2500,
        });
        setSelectedHotel(hotel);
    }, []);

    const handleMapTypeChange = useCallback((type: MapTypeId) => {
        setMapType(type);
        setSelectedHotel(null);
    }, []);

    const flyToPlace = useCallback((lng: number, lat: number, _name: string) => {
        setSelectedHotel(null);
        mapRef.current?.flyTo({
            center: [lng, lat],
            zoom: 14,
            pitch: 0,
            bearing: 0,
            duration: 2500,
        });
    }, []);

    return (
        <div className="flex h-screen bg-gray-950">
            {/* Sidebar — hotel list */}
            <div className="w-80 bg-gray-900 border-r border-gray-800 overflow-y-auto flex flex-col">
                <div className="p-4 border-b border-gray-800">
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Hotel className="w-5 h-5 text-blue-400" />
                        Seoul Hotels
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">
                        {HOTELS.length} properties found
                    </p>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {HOTELS.map((hotel) => (
                        <button
                            key={hotel.id}
                            onClick={() => flyToHotel(hotel)}
                            onMouseEnter={() => setHoveredHotel(hotel.id)}
                            onMouseLeave={() => setHoveredHotel(null)}
                            className={`w-full text-left p-3 border-b border-gray-800 transition-colors cursor-pointer ${
                                selectedHotel?.id === hotel.id
                                    ? 'bg-blue-900/30 border-l-2 border-l-blue-500'
                                    : 'hover:bg-gray-800/70'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <img
                                    src={hotel.image}
                                    alt={hotel.name}
                                    className="w-16 h-12 object-cover rounded-md flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-semibold text-white truncate">
                                        {hotel.name}
                                    </h3>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                        <span className="text-xs text-gray-300">
                                            {hotel.rating}
                                        </span>
                                        <span
                                            className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ml-1 ${getCategoryColor(hotel.category)}`}
                                        >
                                            {hotel.category}
                                        </span>
                                    </div>
                                    <p className="text-sm font-bold text-blue-400 mt-1">
                                        {hotel.price}
                                        <span className="text-[10px] text-gray-500 font-normal">
                                            /night
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Map */}
            <div className="flex-1 relative">
                <Map
                    key={`${mapType}-${terrainEnabled}`}
                    ref={mapRef}
                    mapStyle={mapStyleUrl}
                    standardConfig={isStandardStyle ? standardConfig : undefined}
                    enable3DTerrain={terrainEnabled}
                    terrainExaggeration={1.5}
                    enable3DBuildings={false}
                    initialViewState={{
                        longitude: 126.983,
                        latitude: 37.555,
                        zoom: 13,
                        pitch: 0,
                        bearing: 0,
                    }}
                    maxPitch={85}
                    className="rounded-none"
                >
                    <NavigationControl position="top-right" showCompass visualizePitch />
                    <GeolocateControl position="top-right" positionOptions={{ enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }} />

                    {HOTELS.map((hotel) => (
                        <Marker
                            key={hotel.id}
                            latitude={hotel.latitude}
                            longitude={hotel.longitude}
                            anchor="bottom"
                            onClick={(e) => {
                                e.originalEvent.stopPropagation();
                                flyToHotel(hotel);
                            }}
                            style={{
                                zIndex:
                                    selectedHotel?.id === hotel.id
                                        ? 10
                                        : hoveredHotel === hotel.id
                                          ? 5
                                          : 1,
                            }}
                        >
                            <div
                                className={`cursor-pointer transition-all duration-200 ${
                                    hoveredHotel === hotel.id ||
                                    selectedHotel?.id === hotel.id
                                        ? 'scale-125'
                                        : 'scale-100 hover:scale-110'
                                }`}
                            >
                                <div className="relative flex flex-col items-center drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
                                    <div
                                        className={`
                                            text-sm font-bold px-3 py-1.5 rounded-full shadow-lg border whitespace-nowrap
                                            ${
                                                selectedHotel?.id === hotel.id
                                                    ? 'border-blue-500 bg-blue-600 text-white shadow-blue-500/40'
                                                    : isDarkMap
                                                      ? 'border-gray-600 bg-gray-900/90 text-white shadow-black/50'
                                                      : 'border-gray-200 bg-white text-gray-900 shadow-gray-400/30'
                                            }
                                        `}
                                    >
                                        {hotel.price}
                                    </div>
                                    <div
                                        className={`w-0.5 h-3 ${
                                            selectedHotel?.id === hotel.id
                                                ? 'bg-blue-500'
                                                : isDarkMap
                                                  ? 'bg-gray-500'
                                                  : 'bg-gray-400'
                                        }`}
                                    />
                                    <div className="relative">
                                        <div
                                            className={`w-4 h-4 rounded-full border-2 border-white shadow-md ${getCategoryColor(hotel.category)}`}
                                        />
                                        {(selectedHotel?.id === hotel.id ||
                                            hoveredHotel === hotel.id) && (
                                            <div
                                                className={`absolute inset-0 w-4 h-4 rounded-full animate-ping opacity-50 ${getCategoryColor(hotel.category)}`}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Marker>
                    ))}

                    {selectedHotel && (
                        <Popup
                            latitude={selectedHotel.latitude}
                            longitude={selectedHotel.longitude}
                            anchor="bottom"
                            offset={50}
                            closeOnClick={false}
                            onClose={() => setSelectedHotel(null)}
                            className="!p-0"
                            maxWidth="280px"
                        >
                            <div className="bg-gray-900 text-white rounded-lg overflow-hidden shadow-2xl min-w-[250px]">
                                <div className="relative">
                                    <img
                                        src={selectedHotel.image}
                                        alt={selectedHotel.name}
                                        className="w-full h-36 object-cover"
                                    />
                                    <span
                                        className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full text-white font-medium ${getCategoryColor(selectedHotel.category)}`}
                                    >
                                        {selectedHotel.category}
                                    </span>
                                </div>
                                <div className="p-3">
                                    <h3 className="font-bold text-sm">
                                        {selectedHotel.name}
                                    </h3>
                                    <div className="flex items-center gap-1 mt-1">
                                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                                        <span className="text-sm text-gray-300">
                                            {selectedHotel.rating}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700">
                                        <div>
                                            <span className="text-lg font-bold text-blue-400">
                                                {selectedHotel.price}
                                            </span>
                                            <span className="text-xs text-gray-500 ml-1">
                                                /night
                                            </span>
                                        </div>
                                        <button className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                                            View Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    )}
                </Map>

                {/* ── Search bar (top center) ── */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-[400px]">
                    <PlaceSearchBar onSelect={flyToPlace} />
                </div>

                {/* ── Layers button (opens Map details panel) ── */}
                {!showDetailsPanel && (
                    <button
                        onClick={() => setShowDetailsPanel(true)}
                        className="absolute top-3 left-3 z-10 bg-white rounded-lg shadow-md border border-gray-200 p-2 hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                        <Layers className="w-5 h-5 text-gray-700" />
                        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                )}

                {/* ── Map Details Panel (Google Maps style) ── */}
                <MapDetailsPanel
                    isOpen={showDetailsPanel}
                    onClose={() => setShowDetailsPanel(false)}
                    mapType={mapType}
                    onMapTypeChange={handleMapTypeChange}
                    details={mapDetails}
                    onDetailToggle={handleDetailToggle}
                    showLabels={showLabels}
                    onLabelsToggle={() => setShowLabels((prev) => !prev)}
                />

                {/* Map legend */}
                <div className="absolute bottom-6 left-4 bg-white/95 backdrop-blur-sm text-gray-900 p-3 rounded-xl border border-gray-200 shadow-lg">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
                        Category
                    </p>
                    <div className="space-y-1.5">
                        {['Ultra Luxury', 'Luxury', 'Premium', 'Business', 'Budget'].map(
                            (cat) => (
                                <div key={cat} className="flex items-center gap-2">
                                    <span
                                        className={`w-2.5 h-2.5 rounded-full ${getCategoryColor(cat)}`}
                                    />
                                    <span className="text-xs text-gray-600">{cat}</span>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
