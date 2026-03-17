import { createBrowserClient } from "@supabase/ssr";

let _supabase: ReturnType<typeof createBrowserClient> | null = null;

function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

        if (!url || !key) {
            throw new Error(
                'Supabase client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
            );
        }

        _supabase = createBrowserClient(url, key);
    }
    return _supabase;
}

export function createClient() {
    return getSupabase();
}
