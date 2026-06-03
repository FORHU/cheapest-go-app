import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/postgres/middleware";

/**
 * Routes that require a session check.
 * All other routes skip the session validation entirely — saves ~150ms per request.
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

    if (!PROTECTED_PATTERNS.some((p) => p.test(pathname))) {
        return;
    }

    return await updateSession(request);
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
