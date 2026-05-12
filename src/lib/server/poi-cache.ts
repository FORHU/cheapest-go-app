import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CACHE_TTL_DAYS = 30;

export async function getCached(key: string): Promise<string | null> {
    try {
        const { data: cached, error } = await supabaseAdmin
            .from('place_cache')
            .select('data, cached_at')
            .eq('place_id', key)
            .single();

        if (error || !cached) return null;

        const ageInMs = Date.now() - new Date(cached.cached_at).getTime();
        if (ageInMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null;

        return typeof cached.data === 'string' ? cached.data : JSON.stringify(cached.data);
    } catch {
        return null;
    }
}

export async function setCache(key: string, dataStr: string): Promise<void> {
    try {
        await supabaseAdmin
            .from('place_cache')
            .upsert({
                place_id: key,
                data: dataStr.startsWith('{') ? JSON.parse(dataStr) : { value: dataStr },
                cached_at: new Date().toISOString(),
            });
    } catch (e) {
        console.error('[poi-cache] Failed to set cache:', e);
    }
}
