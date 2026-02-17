import { sendBookingConfirmationEmail } from '@/lib/server/email';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const data = await sendBookingConfirmationEmail(body);
        return Response.json(data);
    } catch (err) {
        return Response.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
