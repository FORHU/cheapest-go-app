import { getAuthenticatedUser } from '@/lib/server/auth';
import { getPreferences, updatePreferences, syncPreferencesFromHistory } from '@/lib/server/preferences';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, supabase, error } = await getAuthenticatedUser();
  if (error || !user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const prefs = await getPreferences(user, supabase);
  return Response.json({ preferences: prefs });
}

export async function PATCH(req: Request) {
  const { user, supabase, error } = await getAuthenticatedUser();
  if (error || !user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json();

  // ?sync=true rebuilds from booking history
  const url = new URL(req.url);
  if (url.searchParams.get('sync') === 'true') {
    const prefs = await syncPreferencesFromHistory(user, supabase);
    return Response.json({ preferences: prefs });
  }

  const prefs = await updatePreferences(user, supabase, body);
  return Response.json({ preferences: prefs });
}
