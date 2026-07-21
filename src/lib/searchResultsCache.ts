import type { Property } from '@/types';

interface CachedResult {
    properties: Property[];
    totalCount: number;
    queryParams: Record<string, any>;
    allMappable: any[];
    cachedAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CachedResult>();

const IGNORED_PARAMS = new Set(['view']);

export function buildSearchCacheKey(params: Record<string, string>): string {
    const normalized = Object.fromEntries(
        Object.entries(params)
            .filter(([k]) => !IGNORED_PARAMS.has(k))
            .sort(([a], [b]) => a.localeCompare(b))
    );
    return JSON.stringify(normalized);
}

export function getSearchResults(key: string): CachedResult | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry;
}

export function setSearchResults(key: string, result: Omit<CachedResult, 'cachedAt'>): void {
    cache.set(key, { ...result, cachedAt: Date.now() });
}
