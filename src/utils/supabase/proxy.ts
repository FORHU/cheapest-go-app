import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Routes that require authentication
const protectedRoutes = ['/checkout', '/trips', '/account'];

// Routes that should redirect to home if already authenticated
const authRoutes = ['/login'];

export const updateSession = async (request: NextRequest) => {
    const { pathname } = request.nextUrl;

    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        supabaseUrl!,
        supabaseKey!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refreshing the auth token
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protected routes — redirect to login if not authenticated
    if (protectedRoutes.some((route) => pathname.startsWith(route))) {
        if (!user) {
            const redirectUrl = new URL('/login', request.url);
            redirectUrl.searchParams.set('returnTo', pathname);
            return NextResponse.redirect(redirectUrl);
        }
    }

    // Auth routes — redirect to home if already authenticated
    if (authRoutes.some((route) => pathname.startsWith(route)) && user) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return supabaseResponse;
};
