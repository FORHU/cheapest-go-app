import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

// Use service role to bypass RLS since we only interact with the cache server-side
const supabaseAdmin = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const placeId = searchParams.get('place_id');

        if (!placeId) {
            return NextResponse.json({ error: 'Missing place_id' }, { status: 400 });
        }

        // 1. Check Supabase cache
        const { data: cached, error: cacheError } = await supabaseAdmin
            .from('place_cache')
            .select('data, cached_at')
            .eq('place_id', placeId)
            .single();

        if (cacheError && cacheError.code !== 'PGRST116') { // PGRST116 is "not found"
            console.error('Cache read error:', cacheError);
        }

        // 2. Validate cache freshness (24 hours = 24 * 60 * 60 * 1000)
        const isCacheValid = cached && (new Date().getTime() - new Date(cached.cached_at).getTime() < 86400000);

        if (isCacheValid) {
            // Return cached data to avoid calling Google API
            return NextResponse.json(cached.data);
        }

        // 3. Cache Miss or Expired: Fetch from Google Places API
        if (!env.GOOGLE_PLACES_API_KEY) {
            return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
        }

        const fields = 'name,rating,photos,formatted_address,geometry,opening_hours,price_level';
        const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${env.GOOGLE_PLACES_API_KEY}`;
        
        const googleRes = await fetch(googleUrl);
        const googleData = await googleRes.json();

        if (!googleRes.ok || googleData.status !== 'OK') {
            return NextResponse.json({ error: 'Failed to fetch from Google APIs', details: googleData }, { status: 500 });
        }

        const placeDetails = googleData.result;

        // 4. Update Supabase Cache
        await supabaseAdmin
            .from('place_cache')
            .upsert({ 
                place_id: placeId, 
                data: placeDetails,
                cached_at: new Date().toISOString()
            });

        return NextResponse.json(placeDetails);

    } catch (err: any) {
        console.error('Place Details API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
