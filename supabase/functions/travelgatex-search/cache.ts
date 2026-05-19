const CACHE_TTL_MS     = 10 * 60 * 1000;
const RAW_CACHE_TTL_MS = 10 * 60 * 1000;

const cache    = new Map<string, { data: any; expiresAt: number }>();
// Stores all pre-transformed hotels (TGX + ETG) sorted by price.
// Load More slices directly — no content re-fetch needed.
const rawCache = new Map<string, { data: { allHotels: any[] }; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key);
  }
  for (const [key, entry] of rawCache.entries()) {
    if (now > entry.expiresAt) rawCache.delete(key);
  }
}, 60_000);

export function getCacheKey(params: Record<string, any>): string {
  const keys = Object.keys(params).sort();
  return keys.map(k => `${k}:${JSON.stringify(params[k])}`).join('|');
}

export function getFromCache(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

export function setCache(key: string, data: any): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function getRawCache(key: string): { allHotels: any[] } | null {
  const entry = rawCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { rawCache.delete(key); return null; }
  return entry.data;
}

export function setRawCache(key: string, data: { allHotels: any[] }): void {
  rawCache.set(key, { data, expiresAt: Date.now() + RAW_CACHE_TTL_MS });
}
