import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Creates a Supabase client with the Service Role Key.
 * This client BYPASSES Row Level Security (RLS).
 * ONLY use this on the server for admin-level operations.
 */
export const createAdminClient = () => {
    if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing Supabase environment variables for Admin Client');
    }
    return createSupabaseClient(supabaseUrl, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};
