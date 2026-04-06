import { useState, useCallback, useRef } from 'react';
import { env } from '@/utils/env';

export interface SearchResult {
    id: string;
    name: string;
    lat: number;
    lng: number;
}

interface UseMapboxSearchParams {
    proximity?: {
        lat: number;
        lng: number;
    };
}

export function useMapboxSearch({ proximity }: UseMapboxSearchParams = {}) {
    const [originQuery, setOriginQuery] = useState('');
    const [originResults, setOriginResults] = useState<SearchResult[]>([]);
    const [showOriginResults, setShowOriginResults] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [origin, setOrigin] = useState<SearchResult | null>(null);

    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleOriginSearch = useCallback((query: string) => {
        setOriginQuery(query);
        if (!query.trim()) {
            setOriginResults([]);
            setShowOriginResults(false);
            return;
        }

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

            searchTimeoutRef.current = setTimeout(async () => {
                setIsSearching(true);
                try {
                    // Remove strict 'types' limit to allow Mapbox to match any feature type (including raw streets/buildings)
                    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${env.MAPBOX_TOKEN}&limit=6&language=en`;
                    
                    // For long pasted addresses, disable autocomplete to force Mapbox to evaluate complete words instead of guessing prefixes
                    if (query.length > 25) {
                        url += '&autocomplete=false';
                    }

                    if (proximity && proximity.lat !== 0 && proximity.lng !== 0) {
                        url += `&proximity=${proximity.lng},${proximity.lat}`;
                    }

                    const res = await fetch(url);
                    if (!res.ok) throw new Error('Geocoding request failed');

                const data = await res.json();
                
                setOriginResults(data.features?.map((f: any) => ({
                    id: f.id,
                    name: f.place_name,
                    lat: f.center[1], // Mapbox returns array [lng, lat]
                    lng: f.center[0],
                })) || []);
                
                setShowOriginResults(true);
            } catch (err) {
                console.error('Mapbox Geocoding error:', err);
                setOriginResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 350);
    }, [proximity]);

    const handleSelectOrigin = useCallback((result: SearchResult) => {
        setOrigin(result);
        setOriginQuery(result.name);
        setShowOriginResults(false);
    }, []);

    const clearSearch = useCallback(() => {
        setOrigin(null);
        setOriginQuery('');
        setOriginResults([]);
        setShowOriginResults(false);
    }, []);

    return {
        originQuery,
        setOriginQuery,
        originResults,
        showOriginResults,
        setShowOriginResults,
        isSearching,
        origin,
        handleOriginSearch,
        handleSelectOrigin,
        clearSearch,
    };
}
