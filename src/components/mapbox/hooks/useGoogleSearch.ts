import { useState, useCallback, useRef } from 'react';

export interface SearchResult {
    id: string;
    name: string;
    lat: number;
    lng: number;
}

interface UseGoogleSearchParams {
    proximity?: {
        lat: number;
        lng: number;
    };
}

export function useGoogleSearch({ proximity }: UseGoogleSearchParams = {}) {
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
                let url = `/api/google/search?input=${encodeURIComponent(query)}`;
                if (proximity && proximity.lat !== 0 && proximity.lng !== 0) {
                    url += `&proximity=${proximity.lat},${proximity.lng}`;
                }

                const res = await fetch(url);
                const data = await res.json();

                if (data.predictions) {
                    setOriginResults(data.predictions.map((p: any) => ({
                        id: p.place_id,
                        name: p.description,
                        lat: 0, // Need Details call to get coordinates
                        lng: 0,
                    })));
                    setShowOriginResults(true);
                } else {
                    setOriginResults([]);
                }
            } catch (err) {
                console.error('Google Search error:', err);
                setOriginResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 400);
    }, [proximity]);

    const handleSelectOrigin = useCallback(async (result: SearchResult) => {
        setOriginQuery(result.name);
        setShowOriginResults(false);

        // If coordinates are missing (likely from autocomplete), fetch them
        if (result.lat === 0 && result.lng === 0) {
            setIsSearching(true);
            try {
                const res = await fetch(`/api/google/geocode?place_id=${result.id}`);
                const data = await res.json();
                
                if (data.result?.geometry?.location) {
                    const lat = data.result.geometry.location.lat;
                    const lng = data.result.geometry.location.lng;
                    const finalResult = { ...result, lat, lng };
                    setOrigin(finalResult);
                }
            } catch (err) {
                console.error('Failed to fetch place details:', err);
            } finally {
                setIsSearching(false);
            }
        } else {
            setOrigin(result);
        }
    }, []);

    const reverseGeocode = useCallback(async (lat: number, lng: number) => {
        setIsSearching(true);
        try {
            const res = await fetch(`/api/google/geocode?lat=${lat}&lng=${lng}`);
            const data = await res.json();
            
            if (data.results && data.results[0]) {
                const result = data.results[0];
                const searchResult: SearchResult = {
                    id: result.place_id,
                    name: result.formatted_address,
                    lat: result.geometry.location.lat,
                    lng: result.geometry.location.lng,
                };
                setOrigin(searchResult);
                setOriginQuery(searchResult.name);
                return searchResult;
            }
        } catch (err) {
            console.error('Reverse Geocode failed:', err);
        } finally {
            setIsSearching(false);
        }
        return null;
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
        reverseGeocode,
        clearSearch,
    };
}
