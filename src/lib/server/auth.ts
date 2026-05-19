import { createClient } from '@/utils/supabase/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface AuthResult {
  user: User | null;
  supabase: SupabaseClient;
  error: string | null;
}

/**
 * Get the currently authenticated user from the server-side Supabase client.
 * Returns { user, supabase, error } — caller decides how to handle unauthenticated state.
 */
export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase, error: 'Not authenticated' };
  }

  return { user, supabase, error: null };
}

/**
 * Fetch the user's profile from the database.
 */
export async function getUserProfile(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[getUserProfile] Error fetching profile:', error);
    return null;
  }

  return data;
}
