import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import crypto from 'crypto';
import { env } from '@/utils/env';

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
 * Authenticate via a CheapestGo API key (cg_live_...) from an Authorization: Bearer header.
 * Used by external integrations like the OpenClaw skill and voice assistant.
 * Returns the user attached to the key, or null if invalid.
 */
export async function getUserFromApiKey(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token.startsWith('cg_live_')) return null;

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const svc  = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: keyRow } = await svc
    .from('api_keys')
    .select('user_id, id')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .maybeSingle();

  if (!keyRow) return null;

  // Update last_used_at (fire and forget)
  svc.from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)
    .then(() => {});

  const { data: { user } } = await svc.auth.admin.getUserById(keyRow.user_id);
  return user ?? null;
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
