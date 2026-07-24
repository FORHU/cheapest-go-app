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
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(160deg, #f5f7fa 0%, #ffffff 60%, #eef1f8 100%)',
                }}
            >
                {logoSrc ? (
                    <img
                        src={logoSrc}
                        style={{ maxWidth: 700, maxHeight: 280, objectFit: 'contain' }}
                    />
                ) : (
                    <span style={{ fontSize: 100, fontWeight: 900, color: '#1a2035' }}>
                        {brandName}
                    </span>
                )}
            </div>
        ),
        { width: 1200, height: 630 },
    );
}
