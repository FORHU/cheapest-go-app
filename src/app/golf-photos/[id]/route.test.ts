import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/golf/photos', () => ({ readPhoto: vi.fn() }));

import { GET } from './route';
import { readPhoto } from '@/lib/server/golf/photos';

const id = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const call = (photoId: string) =>
    GET(new Request(`http://localhost/golf-photos/${photoId}`) as never, { params: Promise.resolve({ id: photoId }) });

beforeEach(() => vi.clearAllMocks());

describe('GET /golf-photos/[id]', () => {
    it('serves the photo inline, typed from the record, cacheable for good', async () => {
        vi.mocked(readPhoto).mockResolvedValueOnce({ bytes: Buffer.from('jpegbytes'), contentType: 'image/jpeg' });
        const res = await call(id);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/jpeg');
        expect(res.headers.get('Content-Disposition')).toBe('inline');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
        expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('jpegbytes');
    });

    it('is a plain 404 for an unknown photo', async () => {
        vi.mocked(readPhoto).mockResolvedValueOnce(null);
        const res = await call(id);
        expect(res.status).toBe(404);
        expect(res.headers.get('Cache-Control') ?? '').not.toMatch(/immutable/);
    });
});
