import { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${supabaseUrl}/functions/v1/travelgatex-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => 'Unknown error');
      return new Response(JSON.stringify({ error: err }), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(res.body, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
