import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json();
        const resendApiKey = process.env.RESEND_API_KEY;

        if (!resendApiKey) {
            return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
        }

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        console.log('Testing Resend email to:', email);

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Test <onboarding@resend.dev>',
                to: [email],
                subject: 'Test Email from TravelBooking',
                html: '<h1>Test Email</h1><p>If you received this, Resend is working!</p>',
            }),
        });

        const data = await response.json();
        console.log('Resend response:', response.status, data);

        if (response.ok) {
            return NextResponse.json({ success: true, data });
        } else {
            return NextResponse.json({ success: false, error: data }, { status: 400 });
        }
    } catch (error: any) {
        console.error('Test email error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
