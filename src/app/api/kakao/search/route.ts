import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');

    if (!query) {
        return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const apiKey = process.env.KAKAO_REST_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Kakao API not configured' }, { status: 503 });
    }

    const upstream = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    upstream.searchParams.set('query', query);
    upstream.searchParams.set('size', '15');
    if (searchParams.get('x')) upstream.searchParams.set('x', searchParams.get('x')!);
    if (searchParams.get('y')) upstream.searchParams.set('y', searchParams.get('y')!);
    if (searchParams.get('radius')) upstream.searchParams.set('radius', searchParams.get('radius')!);

    const res = await fetch(upstream.toString(), {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        next: { revalidate: 60 },
    });

    if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: 'Kakao API error', details: text }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
}
