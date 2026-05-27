const DUFFEL_ENDPOINT = 'https://api.duffel.com/air/payments/balances';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface BalanceEntry {
  currency: string;
  available: number;
}

interface CachedBalance {
  balances: BalanceEntry[];
  fetchedAt: number;
}

// Module-level cache — shared across requests in the same Vercel function instance
let _cache: CachedBalance | null = null;

export async function getDuffelBalances(token: string, forceRefresh = false): Promise<BalanceEntry[]> {
  const now = Date.now();
  if (!forceRefresh && _cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.balances;
  }

  const res = await fetch(DUFFEL_ENDPOINT, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Duffel-Version': 'v2',
    },
  });

  if (!res.ok) {
    throw new Error(`Duffel balance fetch failed: ${res.status}`);
  }

  const json = await res.json();
  const balances: BalanceEntry[] = (json.data ?? []).map((b: any) => ({
    currency: b.currency as string,
    available: parseFloat(b.available),
  }));

  _cache = { balances, fetchedAt: now };
  return balances;
}

export function getAvailableBalance(balances: BalanceEntry[], currency: string): number {
  return balances.find(b => b.currency.toUpperCase() === currency.toUpperCase())?.available ?? 0;
}
