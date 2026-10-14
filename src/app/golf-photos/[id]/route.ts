import { NextRequest, NextResponse } from 'next/server';
import { readPhoto } from '@/lib/server/golf/photos';

export const dynamic = 'force-dynamic';

/**
 * A course's uploaded photo, served by the app so the bucket stays private (ADR-0050, ADR-0040).
 *
 * Public on purpose: it is a picture on a storefront page. The id is a random uuid and the type
 * served is the one sniffed from the bytes at upload (JPEG, PNG or WebP only, never SVG or HTML),
 * so inline is safe. The id never changes what it points at, so it caches for good.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const photo = await readPhoto(id);
    if (!photo) return new NextResponse('Not found', { status: 404 });

    return new NextResponse(new Uint8Array(photo.bytes), {
        status: 200,
        headers: {
            'Content-Type': photo.contentType,
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}
