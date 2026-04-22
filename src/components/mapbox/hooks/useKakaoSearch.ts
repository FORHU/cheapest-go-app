import { useState, useCallback, useRef } from 'react';
import { normalizeKakaoPoi } from '@/utils/geo';

export interface KakaoSearchResult {
    id: string;
    name: string;
    address: string;
    category: string;
    lat: number;
    lng: number;
    externalUrl: string;
    phone: string | null;
    distance: number | null;
}

interface UseKakaoSearchParams {
    proximity?: {
        lat: number;
        lng: number;
    };
}

export function useKakaoSearch({ proximity }: UseKakaoSearchParams = {}) {
    const [results, setResults] = useState<KakaoSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearch = useCallback((query: string) => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                let url = `/api/kakao/search?query=${encodeURIComponent(query)}`;
                if (proximity && proximity.lat !== 0 && proximity.lng !== 0) {
                    url += `&y=${proximity.lat}&x=${proximity.lng}&radius=5000`;
                }

                const res = await fetch(url);
                const data = await res.json();

                if (data.documents) {
                    setResults(data.documents.map(normalizeKakaoPoi));
                } else {
                    setResults([]);
                }
            } catch (err) {
                console.error('Kakao Search error:', err);
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 400);
    }, [proximity]);

    const fetchRecommendations = useCallback(async (lat: number, lng: number) => {
        setIsSearching(true);
        try {
            // Fetch multiple categories for a rich "recommended" set
            // AT4: Tourist Attraction, FD6: Food, CE7: Cafe, CT1: Culture
            const categories = ['관광명소', '맛집', '카페', '문화시설'];
            const promises = categories.map(query => 
                fetch(`/api/kakao/search?query=${encodeURIComponent(query)}&y=${lat}&x=${lng}&radius=5000`)
                    .then(res => res.json())
                    .catch(() => ({ documents: [] }))
            );

            const results = await Promise.all(promises);
            const allDocs = results.flatMap(r => r.documents || []);
            
            // Deduplicate by ID
            const uniqueDocs = Array.from(new Map(allDocs.map(item => [item.id, item])).values());
            
            const normalized = uniqueDocs.map(normalizeKakaoPoi);
            setResults(normalized);
            return normalized;
        } catch (err) {
            console.error('Kakao Recommendations error:', err);
            setResults([]);
            return [];
        } finally {
            setIsSearching(false);
        }
    }, []);

    const clearSearch = useCallback(() => {
        setResults([]);
    }, []);

    return {
        results,
        isSearching,
        handleSearch,
        fetchRecommendations,
        clearSearch,
    };
}

