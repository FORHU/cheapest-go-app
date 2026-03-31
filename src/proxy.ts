import { type NextRequest } from "next/server";
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
    /^\/api\/flights\/(book|cancel-booking|confirm)/,
];

export default async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip auth for public routes — no Supabase network call needed
    if (!PROTECTED_PATTERNS.some((p) => p.test(pathname))) {
        return;
    }

    return await updateSession(request);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
