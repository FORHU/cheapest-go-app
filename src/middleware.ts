import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Routes that require a Supabase auth check.
 * All other routes skip the getUser() round-trip entirely — ~150ms saved per request.
 */
const PROTECTED_PATTERNS = [
    /^\/admin/,
    /^\/checkout/,
    /^\/account/,
    /^\/api\/booking/,
    /^\/api\/voucher/,
    /^\/api\/admin/,
    // Flight operations require auth; /api/flights/search is public so match only write ops
    /^\/api\/flights\/(book|cancel-booking|confirm)/,
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip auth for public routes — no Supabase network call needed
    if (!PROTECTED_PATTERNS.some((p) => p.test(pathname))) {
        return NextResponse.next();
    }

    return updateSession(request);
}

export const config = {
    matcher: [
        // Run on all routes except Next.js internals and static assets
        "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
