import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const LEVEL_PREFIX: Record<string, string> = {
    error: '🔴 [MOBILE:ERROR]',
    warn:  '🟡 [MOBILE:WARN] ',
    info:  '🔵 [MOBILE:INFO] ',
    debug: '⚪ [MOBILE:DEBUG]',
};

/**
 * POST /api/mobile/log
 * Remote log drain — mobile app POSTs structured logs here so they appear
 * in the Next.js terminal during development.
 *
 * Body: { level, tag, message, data?, timestamp?, screen?, build? }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { level = 'info', tag = '', message = '', data, screen, build } = body;

        const prefix = LEVEL_PREFIX[level] ?? LEVEL_PREFIX.info;
        const tagStr  = tag    ? ` [${tag}]`    : '';
        const scrStr  = screen ? ` @${screen}`  : '';
        const bldStr  = build  ? ` v${build}`   : '';
        const header  = `${prefix}${tagStr}${scrStr}${bldStr} ${message}`;

        if (level === 'error') {
            console.error(header, data !== undefined ? data : '');
        } else if (level === 'warn') {
            console.warn(header, data !== undefined ? data : '');
        } else {
            console.log(header, data !== undefined ? data : '');
        }
    } catch {
        // never crash on a logging endpoint
    }

    return NextResponse.json({ ok: true });
}
