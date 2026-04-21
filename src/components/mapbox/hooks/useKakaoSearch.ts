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

    const clearSearch = useCallback(() => {
        setResults([]);
    }, []);

    return {
        results,
        isSearching,
        handleSearch,
        clearSearch,
    };
}
