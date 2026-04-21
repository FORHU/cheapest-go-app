import { NextResponse } from 'next/server';
import { env } from '@/utils/env';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const x = searchParams.get('x'); // Longitude
    const y = searchParams.get('y'); // Latitude
    const radius = searchParams.get('radius') || '2000';

    if (!query) {
        return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }

    if (!env.KAKAO_REST_API_KEY) {
        return NextResponse.json({ error: 'Kakao API key not configured' }, { status: 500 });
    }

    try {
        let url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=15&sort=accuracy`;
        
        if (x && y) {
            url += `&x=${x}&y=${y}&radius=${radius}`;
        }

        const response = await fetch(url, {
            headers: {
                'Authorization': `KakaoAK ${env.KAKAO_REST_API_KEY}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json();
            return NextResponse.json({ error: 'Kakao API error', details: errorData }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Kakao API proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
