import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const alt = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
    const brandName = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';
    const brandLogo = process.env.NEXT_PUBLIC_BRAND_LOGO ?? '/Web_Logo_Light.png';
    const tagline = process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? 'Book Flights & Hotels at the Lowest Price';

    let logoSrc: string | null = null;
    try {
        const logoPath = path.join(process.cwd(), 'public', brandLogo.replace(/^\//, ''));
        const buffer = fs.readFileSync(logoPath);
        const ext = path.extname(brandLogo).slice(1).toLowerCase();
        const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        logoSrc = `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {}

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '24px',
                    background: 'linear-gradient(160deg, #f5f7fa 0%, #ffffff 60%, #eef1f8 100%)',
                }}
            >
                {logoSrc ? (
                    <img
                        src={logoSrc}
                        style={{ maxWidth: 600, maxHeight: 220, objectFit: 'contain' }}
                    />
                ) : (
                    <span style={{ fontSize: 100, fontWeight: 900, color: '#1a2035' }}>
                        {brandName}
                    </span>
                )}
                <span style={{
                    fontSize: 32,
                    fontWeight: 600,
                    color: '#6b7280',
                    letterSpacing: '-0.5px',
                }}>
                    {tagline}
                </span>
            </div>
        ),
        { width: 1200, height: 630 },
    );
}
