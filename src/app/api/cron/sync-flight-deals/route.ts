import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    return NextResponse.json({ success: true, message: 'Sync flight deals cron job' });
}
