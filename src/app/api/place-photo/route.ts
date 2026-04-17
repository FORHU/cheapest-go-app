import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/utils/env';

const supabaseAdmin = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const photoReference = searchParams.get('photo_reference');
        const maxWidth = searchParams.get('maxwidth') || '400';

        if (!photoReference) {
            return NextResponse.json({ error: 'Missing photo_reference' }, { status: 400 });
        }

        const fileName = `${photoReference}_${maxWidth}.jpg`;

        // 1. Check if image exists in Supabase Storage
        const { data: publicUrlData } = supabaseAdmin.storage
            .from('place-photos')
            .getPublicUrl(fileName);

        // We do a HEAD request to verify if the file actually exists
        const checkRes = await fetch(publicUrlData.publicUrl, { method: 'HEAD' });
        
        if (checkRes.ok) {
            // Cache hit: return the Supabase URL
            return NextResponse.json({ url: publicUrlData.publicUrl });
        }

        // 2. Cache Miss: Fetch image from Google Places API
        if (!env.GOOGLE_PLACES_API_KEY) {
            return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
        }

        const googlePhotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${env.GOOGLE_PLACES_API_KEY}`;
        
        const googleRes = await fetch(googlePhotoUrl);

        if (!googleRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch photo from Google' }, { status: googleRes.status });
        }

        const arrayBuffer = await googleRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 3. Upload to Supabase Storage
        const { error: uploadError } = await supabaseAdmin.storage
            .from('place-photos')
            .upload(fileName, buffer, {
                contentType: googleRes.headers.get('content-type') || 'image/jpeg',
                upsert: true,
                cacheControl: '31536000' // Instruct CDNs to cache for 1 year
            });

        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            // Even if upload fails, we ideally could return a fallback or base64, but best to log and proceed to return Supabase URL 
            // since we depend on it. If upload failed, the GET will fail next time anyway.
        }

        // 4. Get the new public URL and return
        const { data: newPublicUrlData } = supabaseAdmin.storage
            .from('place-photos')
            .getPublicUrl(fileName);

        return NextResponse.json({ url: newPublicUrlData.publicUrl });

    } catch (err: any) {
        console.error('Place Photo API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
